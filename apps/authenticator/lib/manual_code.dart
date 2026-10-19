import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';

const _alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

String _base32(List<int> data) {
  var bits = 0, acc = 0;
  final result = StringBuffer();
  for (final byte in data) {
    acc = ((acc << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result.write(_alphabet[(acc >> bits) & 31]);
    }
  }
  if (bits > 0) result.write(_alphabet[(acc << (5 - bits)) & 31]);
  return result.toString();
}

/// Fixed canonical CBOR prefix for ["ZV/manual-check", 1, bstr(32)].
/// This is transport checksum encoding, not a general CBOR parser or authentication.
String manualCode(Uint8List key) {
  if (key.length != 32) {
    throw const FormatException('Expected 256-bit record key');
  }
  final checksumInput = [
    0x83,
    0x6f,
    ...utf8.encode('ZV/manual-check'),
    0x01,
    0x58,
    0x20,
    ...key,
  ];
  final checksum = _base32(sha256.convert(checksumInput).bytes).substring(0, 4);
  return _base32(key) + checksum;
}

Uint8List parseManualCode(String input) {
  if (input.length > 128) throw const FormatException('Code size');
  final code = input
      .toUpperCase()
      .replaceAll(RegExp('[ -]'), '')
      .replaceAll('O', '0')
      .replaceAll(RegExp('[IL]'), '1');
  if (code.length != 56 || code.split('').any((c) => !_alphabet.contains(c))) {
    throw const FormatException('Code format');
  }
  var bits = 0, acc = 0;
  final output = <int>[];
  for (final c in code.substring(0, 52).split('')) {
    acc = ((acc << 5) | _alphabet.indexOf(c)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.add((acc >> bits) & 255);
    }
  }
  final key = Uint8List.fromList(output);
  if ((acc & 15) != 0 || manualCode(key) != code) {
    throw const FormatException('Checksum or padding');
  }
  return key;
}
