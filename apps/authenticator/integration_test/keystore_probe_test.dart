import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:zero_vault_probe/main.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('native bridge reports capability without software fallback', (
    tester,
  ) async {
    await tester.pumpWidget(const ProbeApp());
    final result = await const MethodChannel(
      'dev.zerovault/p1',
    ).invokeMapMethod<String, Object?>('inspect');
    expect(result, isNotNull);
    expect(result!['hpkeKeystoreIntegration'], contains('NOT_IMPLEMENTED'));
    // No assertion here treats simulator success as physical hardware evidence.
    // ignore: avoid_print
    print('P1_NATIVE_PROBE=${jsonEncode(result)}');
  });
}
