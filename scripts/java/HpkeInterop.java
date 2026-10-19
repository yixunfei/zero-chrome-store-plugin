import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HexFormat;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.bouncycastle.crypto.hpke.HPKE;

/** Independent software implementation check. Does not exercise Android Keystore. */
public final class HpkeInterop {
    private static byte[] hex(JsonObject object, String name) {
        return HexFormat.of().parseHex(object.get(name).getAsString());
    }

    private static HPKE suite() {
        return new HPKE(HPKE.mode_base, HPKE.kem_P256_SHA256, HPKE.kdf_HKDF_SHA256, HPKE.aead_AES_GCM256);
    }

    private static void officialVector(String path) throws Exception {
        var v = JsonParser.parseString(Files.readString(Path.of(path))).getAsJsonObject();
        var hpke = suite();
        var pair = hpke.deserializePrivateKey(hex(v, "skRm"), hex(v, "pkRm"));
        var receiver = hpke.setupBaseR(hex(v, "enc"), pair, hex(v, "info"));
        int count = 0;
        for (var entry : v.getAsJsonArray("encryptions")) {
            var item = entry.getAsJsonObject();
            var plaintext = receiver.open(hex(item, "aad"), hex(item, "ct"));
            if (!java.util.Arrays.equals(plaintext, hex(item, "pt"))) throw new AssertionError("RFC plaintext mismatch");
            count++;
        }
        System.out.println("Bouncy Castle RFC vector encryptions passed: " + count);
    }

    private static void applicationVector(String path) throws Exception {
        var v = JsonParser.parseString(Files.readString(Path.of(path))).getAsJsonObject();
        var hpke = suite();
        var pair = hpke.deserializePrivateKey(hex(v, "sk"), hex(v, "pk"));
        var context = hpke.setupBaseR(hex(v, "enc"), pair, hex(v, "context"));
        var plaintext = context.open(hex(v, "context"), hex(v, "ct"));
        if (!java.util.Arrays.equals(plaintext, hex(v, "plaintext"))) throw new AssertionError("TS -> Java mismatch");
        var sender = hpke.setupBaseS(pair.getPublic(), hex(v, "context"));
        var response = new JsonObject();
        response.addProperty("enc", HexFormat.of().formatHex(sender.getEncapsulation()));
        response.addProperty("ct", HexFormat.of().formatHex(sender.seal(hex(v, "context"), plaintext)));
        Files.writeString(Path.of("artifacts/local/java-response.json"), response.toString());
        System.out.println("TypeScript -> Java HPKE passed; Java response written (synthetic data only)");
    }

    public static void main(String[] args) throws Exception {
        officialVector("packages/test-vectors/rfc9180-p256.json");
        applicationVector("artifacts/local/interop.json");
    }
}
