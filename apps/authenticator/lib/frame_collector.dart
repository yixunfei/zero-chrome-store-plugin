import 'dart:convert';
import 'dart:typed_data';
import 'package:cbor/cbor.dart';
import 'package:crypto/crypto.dart';

bool _equal(List<int> a, List<int> b) =>
    a.length == b.length &&
    List.generate(a.length, (i) => a[i] == b[i]).every((x) => x);

/// Reject recursive/tagged/indefinite CBOR before invoking the general decoder.
/// Only the fixed six-element frame tuple is admitted; payload stays opaque.
void _preflight(Uint8List raw) {
  final prefix = [0x86, 0x68, ...utf8.encode('ZV/frame'), 0x01, 0x58, 0x20];
  if (raw.length < 49 ||
      raw.length > 800 ||
      !_equal(raw.sublist(0, prefix.length), prefix)) {
    throw const FormatException('Frame header');
  }
  var offset = prefix.length + 32;
  for (var i = 0; i < 2; i++) {
    if (offset >= raw.length) {
      throw const FormatException('Truncated frame integer');
    }
    final first = raw[offset++];
    if (first == 0x18) {
      if (offset >= raw.length) {
        throw const FormatException('Truncated frame integer');
      }
      final value = raw[offset++];
      if (value < 24 || value > 47) {
        throw const FormatException('Frame integer');
      }
    } else if (first > 23) {
      throw const FormatException('Frame integer');
    }
  }
  if (offset >= raw.length) throw const FormatException('Missing chunk');
  final head = raw[offset++];
  int size;
  if (head >= 0x40 && head <= 0x57) {
    size = head - 0x40;
  } else if (head == 0x58 && offset < raw.length) {
    size = raw[offset++];
    if (size < 24) throw const FormatException('Noncanonical chunk');
  } else if (head == 0x59 && offset + 1 < raw.length) {
    size = (raw[offset++] << 8) | raw[offset++];
    if (size < 256) throw const FormatException('Noncanonical chunk');
  } else {
    throw const FormatException('Chunk encoding');
  }
  if (size < 1 || size > 700 || offset + size != raw.length) {
    throw const FormatException('Chunk size');
  }
}

class FrameCollector {
  FrameCollector({int Function()? now})
    : _now = now ?? (() => _clock.elapsedMilliseconds);
  static final _clock = Stopwatch()..start();
  final int Function() _now;
  final _chunks = <int, List<int>>{};
  List<int>? _digest;
  int _started = 0;
  int total = 0;
  int get collected => _chunks.length;

  Uint8List? add(String text) {
    if (!text.startsWith('ZV1:') || text.length > 1100) {
      throw const FormatException('QR text format');
    }
    final raw = base64.decode(text.substring(4));
    _preflight(raw);
    final f = cbor.decode(raw) as CborList;
    final digest = (f[2] as CborBytes).bytes;
    final index = (f[3] as CborInt).toInt(), count = (f[4] as CborInt).toInt();
    final chunk = (f[5] as CborBytes).bytes;
    if (count < 1 ||
        count > 47 ||
        index >= count ||
        (index < count - 1 && chunk.length != 700)) {
      throw const FormatException('Frame bounds');
    }
    if (_digest != null && _now() - _started > 120000) {
      throw const FormatException('Assembly expired');
    }
    if (_digest != null && (!_equal(_digest!, digest) || total != count)) {
      throw const FormatException('Mixed frames');
    }
    if (_digest == null) {
      _digest = digest;
      total = count;
      _started = _now();
    }
    final old = _chunks[index];
    if (old != null && !_equal(old, chunk)) {
      throw const FormatException('Conflicting duplicate');
    }
    _chunks[index] = chunk;
    if (_chunks.values.fold<int>(0, (n, value) => n + value.length) > 32768) {
      throw const FormatException('Message size');
    }
    if (_chunks.length != total) return null;
    final out = BytesBuilder();
    for (var i = 0; i < total; i++) {
      out.add(_chunks[i]!);
    }
    final message = out.takeBytes();
    if (!_equal(sha256.convert(message).bytes, digest)) {
      throw const FormatException('Message digest');
    }
    return message;
  }
}
