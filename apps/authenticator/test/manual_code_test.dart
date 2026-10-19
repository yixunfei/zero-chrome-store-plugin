import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:zero_vault_probe/manual_code.dart';

void main() {
  test(
    'Dart matches TypeScript manual-code vectors and rejects corruption',
    () {
      final vectors =
          jsonDecode(
                File(
                  '../../packages/test-vectors/manual-code.json',
                ).readAsStringSync(),
              )
              as List;
      for (final vector in vectors) {
        final hex = vector['keyHex'] as String;
        final key = Uint8List.fromList(
          List.generate(
            32,
            (i) => int.parse(hex.substring(i * 2, i * 2 + 2), radix: 16),
          ),
        );
        final code = vector['code'] as String;
        expect(manualCode(key), code);
        expect(parseManualCode(code.toLowerCase()), key);
        for (var i = 0; i < 56; i++) {
          final damaged =
              code.substring(0, i) +
              (code[i] == '0' ? '2' : '0') +
              code.substring(i + 1);
          expect(() => parseManualCode(damaged), throwsFormatException);
        }
      }
      expect(
        () => parseManualCode('ZV/session:invalid'),
        throwsFormatException,
      );
    },
  );
}
