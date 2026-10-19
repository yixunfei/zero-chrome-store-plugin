import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'frame_collector.dart';

class ScannerProbe extends StatefulWidget {
  const ScannerProbe({super.key});
  @override
  State<ScannerProbe> createState() => _ScannerProbeState();
}

class _ScannerProbeState extends State<ScannerProbe>
    with WidgetsBindingObserver {
  final controller = MobileScannerController(formats: [BarcodeFormat.qrCode]);
  final collector = FrameCollector();
  String status = '等待 ZV1 合成请求二维码；不执行解密或批准';
  bool completed = false;
  Future<void> cameraTransition = Future<void>.value();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // mobile_scanner delegates lifecycle handling to users of an external controller.
    cameraTransition = cameraTransition
        .then((_) async {
          if (!mounted || !controller.value.hasCameraPermission) return;
          if (state == AppLifecycleState.resumed && !completed) {
            await controller.start();
          } else {
            await controller.stop();
          }
        })
        .catchError((Object error) {
          if (mounted) {
            setState(() => status = '摄像头状态切换失败，请返回后重试。');
          }
        });
  }

  void detect(BarcodeCapture capture) {
    if (completed) return;
    for (final barcode in capture.barcodes) {
      final text = barcode.rawValue;
      if (text == null) continue;
      try {
        final message = collector.add(text);
        if (message != null) {
          completed = true;
          controller.stop();
          setState(
            () =>
                status = '组帧校验通过：${message.length} 字节。\n尚未核验签名、记录或 HPKE，不产生批准。',
          );
          break;
        }
        setState(
          () => status =
              '收到 ${collector.collected} / ${collector.total} 帧；请切换电脑上的帧',
        );
      } on FormatException catch (error) {
        completed = true;
        controller.stop();
        setState(() => status = '传输拒绝：${error.message}。返回后可重新开始。');
        break;
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('P1 · 扫码传输探针')),
    body: Column(
      children: [
        Expanded(
          child: MobileScanner(controller: controller, onDetect: detect),
        ),
        Padding(padding: const EdgeInsets.all(24), child: Text(status)),
      ],
    ),
  );
}
