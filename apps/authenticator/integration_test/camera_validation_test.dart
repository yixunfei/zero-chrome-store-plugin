import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:zero_vault_probe/main.dart';

Future<void> waitFor(WidgetTester tester, bool Function() ready) async {
  final clock = Stopwatch()..start();
  while (!ready()) {
    if (clock.elapsed > const Duration(seconds: 30)) {
      fail('Camera state did not become ready');
    }
    await tester.pump(const Duration(milliseconds: 200));
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('emulated camera opens, stops on navigation, and reopens', (
    tester,
  ) async {
    final permissionReady = File(
      '${Directory.systemTemp.path}/p1-camera-ready',
    );
    if (permissionReady.existsSync()) await permissionReady.delete();
    // Host grants only this synthetic test app's CAMERA permission, then writes the marker.
    // ignore: avoid_print
    print('P1_CAMERA_READY=${permissionReady.path}');
    await waitFor(tester, permissionReady.existsSync);
    await tester.pumpWidget(const ProbeApp());
    await tester.pumpAndSettle();
    final results = <Map<String, Object?>>[];
    for (var attempt = 0; attempt < 2; attempt++) {
      final button = find.text('4. 扫描合成请求（仅传输）');
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();
      final scanner = tester.widget<MobileScanner>(find.byType(MobileScanner));
      final controller = scanner.controller!;
      await waitFor(
        tester,
        () => controller.value.isRunning || controller.value.error != null,
      );
      expect(controller.value.error, isNull);
      expect(controller.value.isRunning, isTrue);
      expect(controller.value.hasCameraPermission, isTrue);
      expect(controller.value.size.width, greaterThan(0));
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await waitFor(tester, () => !controller.value.isRunning);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await waitFor(tester, () => controller.value.isRunning);
      results.add({
        'opened': true,
        'width': controller.value.size.width,
        'height': controller.value.size.height,
        'permissionGranted': controller.value.hasCameraPermission,
        'frameworkInactiveStopsNativeCamera': true,
        'frameworkResumedRestartsNativeCamera': true,
      });
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      expect(find.byType(MobileScanner), findsNothing);
      expect(tester.takeException(), isNull);
    }
    // ignore: avoid_print
    print(
      'P1_CAMERA_RESULT=${jsonEncode({'camera': 'Android emulator emulated rear camera', 'cycles': results, 'pageNavigationPassed': true, 'physicalOpticsTested': false})}',
    );
  });
}
