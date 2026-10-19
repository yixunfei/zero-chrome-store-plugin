import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'scanner_probe.dart';

void main() => runApp(const ProbeApp());

class ProbeApp extends StatefulWidget {
  const ProbeApp({super.key});
  @override
  State<ProbeApp> createState() => _ProbeAppState();
}

class _ProbeAppState extends State<ProbeApp> {
  static const channel = MethodChannel('dev.zerovault/p1');
  String report = '尚未执行；不代表硬件已验证。';
  bool busy = false;

  Future<void> run(String method) async {
    setState(() => busy = true);
    try {
      final result = await channel.invokeMethod<Object?>(method);
      if (mounted) {
        setState(
          () => report = const JsonEncoder.withIndent('  ').convert(result),
        );
      }
    } on PlatformException catch (error) {
      if (mounted) setState(() => report = '${error.code}: ${error.message}');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    theme: ThemeData(
      colorSchemeSeed: const Color(0xff12695c),
      brightness: Brightness.dark,
    ),
    home: Scaffold(
      appBar: AppBar(title: const Text('P1 · Android 密钥能力')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text('仅合成数据 · HPKE 与扫码闭环尚未实现', style: TextStyle(fontSize: 22)),
          const SizedBox(height: 16),
          const Text('模拟器的报告不算真机硬件证据。30 秒窗口只用于评估 Android 14 接口限制，不是每次释放授权方案。'),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: busy ? null : () => run('inspect'),
            child: const Text('1. 检查密钥能力与未认证操作'),
          ),
          OutlinedButton(
            onPressed: busy ? null : () => run('sign'),
            child: const Text('2. 认证并实际签名'),
          ),
          OutlinedButton(
            onPressed: busy ? null : () => run('windowAgreement'),
            child: const Text('3. 认证窗口内实际 ECDH'),
          ),
          Builder(
            builder: (context) => OutlinedButton(
              onPressed: busy
                  ? null
                  : () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const ScannerProbe(),
                      ),
                    ),
              child: const Text('4. 扫描合成请求（仅传输）'),
            ),
          ),
          const SizedBox(height: 24),
          SelectableText(
            report,
            style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
          ),
        ],
      ),
    ),
  );
}
