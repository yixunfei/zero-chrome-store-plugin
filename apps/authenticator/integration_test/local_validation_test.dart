import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:zero_vault_probe/frame_collector.dart';
import 'package:zero_vault_probe/main.dart';
import 'generated/qr_capture.dart';

Future<void> waitFor(WidgetTester tester, bool Function() condition) async {
  final deadline = DateTime.now().add(const Duration(seconds: 20));
  while (!condition()) {
    if (DateTime.now().isAfter(deadline)) {
      fail('Timed out waiting for device UI');
    }
    await tester.pump(const Duration(milliseconds: 200));
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('actual Android UI reports key capability and fails closed', (
    tester,
  ) async {
    await tester.pumpWidget(const ProbeApp());
    await tester.pumpAndSettle();
    await tester.tap(find.text('1. 检查密钥能力与未认证操作'));
    await waitFor(
      tester,
      () => find
          .byWidgetPredicate(
            (w) =>
                w is SelectableText &&
                (w.data?.contains('hpkeKeystoreIntegration') ?? false),
          )
          .evaluate()
          .isNotEmpty,
    );
    final reportText = tester
        .widget<SelectableText>(find.byType(SelectableText))
        .data!;
    final report = jsonDecode(reportText);
    expect(report['hpkeKeystoreIntegration'], contains('NOT_IMPLEMENTED'));
    await tester.tap(find.text('2. 认证并实际签名'));
    await waitFor(
      tester,
      () => tester
          .widget<SelectableText>(find.byType(SelectableText))
          .data!
          .contains('PROBE_FAILED'),
    );
    final error = tester
        .widget<SelectableText>(find.byType(SelectableText))
        .data;
    // ignore: avoid_print
    print(
      'P1_UI_RESULT=${jsonEncode({'platform': 'Android emulator', 'inspectionViaButton': report, 'signButtonResult': error, 'softwareFallback': false})}',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Android ML Kit decodes actual Chrome-rendered QR images and reassembles',
    (tester) async {
      final scanner = MobileScannerController(
        autoStart: false,
        formats: [BarcodeFormat.qrCode],
      );
      final collector = FrameCollector();
      final directory = await Directory.systemTemp.createTemp('zv-p1-qr-');
      List<int>? message;
      final strings = <String>[];
      try {
        for (var index = browserQrImages.length - 1; index >= 0; index--) {
          final image = File('${directory.path}/frame-$index.png');
          await image.writeAsBytes(base64Decode(browserQrImages[index]));
          final capture = await scanner.analyzeImage(image.path);
          expect(
            capture,
            isNotNull,
            reason:
                'Android native decoder did not recognize rendered frame $index',
          );
          final text = capture!.barcodes.single.rawValue!;
          strings.add(text);
          message = collector.add(text);
        }
        expect(message, hasLength(expectedRequestBytes));
        expect(
          () => FrameCollector().add(
            'ZV1:${base64Encode(List.filled(100, 0x81))}',
          ),
          throwsFormatException,
        );
        // ignore: avoid_print
        print(
          'P1_DECODER_RESULT=${jsonEncode({'nativeDecoder': 'mobile_scanner Android ML Kit', 'decodedFrames': strings.length, 'reassembledBytes': message!.length, 'expectedBytes': expectedRequestBytes, 'reversedOrder': true, 'source': 'PNG screenshots of actual Chrome extension img elements', 'cameraOpticsTested': false, 'authorizationProduced': false})}',
        );
      } finally {
        await scanner.dispose();
        await directory.delete(recursive: true);
      }
    },
  );
}
