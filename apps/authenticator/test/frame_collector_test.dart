import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:zero_vault_probe/frame_collector.dart';

void main() {
  test(
    'Dart reassembles TypeScript frames, rejects hostile nesting and expiry',
    () {
      final v = jsonDecode(
        File('../../packages/test-vectors/frames.json').readAsStringSync(),
      );
      final frames = List<String>.from(v['frames'] as List);
      final collector = FrameCollector();
      expect(collector.add(frames[2]), isNull);
      expect(collector.add(frames[2]), isNull);
      expect(collector.add(frames[0]), isNull);
      final message = collector.add(frames[1])!;
      expect(
        message.map((b) => b.toRadixString(16).padLeft(2, '0')).join(),
        v['messageHex'],
      );
      expect(
        () =>
            FrameCollector().add('ZV1:${base64Encode(List.filled(100, 0x81))}'),
        throwsFormatException,
      );
      var time = 0;
      final timed = FrameCollector(now: () => time);
      timed.add(frames[0]);
      time = 120001;
      expect(() => timed.add(frames[1]), throwsFormatException);
      expect(
        () => FrameCollector().add('ZV1:${'A' * 1200}'),
        throwsFormatException,
      );
    },
  );
}
