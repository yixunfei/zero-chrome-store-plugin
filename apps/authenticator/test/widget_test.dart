import 'package:flutter_test/flutter_test.dart';
import 'package:zero_vault_probe/main.dart';

void main() {
  testWidgets('unrun probe is not hardware success', (tester) async {
    await tester.pumpWidget(const ProbeApp());
    expect(find.text('尚未执行；不代表硬件已验证。'), findsOneWidget);
  });
}
