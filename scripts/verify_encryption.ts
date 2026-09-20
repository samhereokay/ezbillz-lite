import { encrypt, decrypt } from "../src/lib/crypto";

function testEncryption() {
  const originalKey = process.env.ENCRYPTION_KEY;
  const testString = "super_secret_test_data";

  console.log("1. Testing with correct key...");
  try {
    const encrypted = encrypt(testString);
    const decrypted = decrypt(encrypted);
    if (decrypted !== testString) throw new Error("Mismatch!");
    console.log("Correct key: OK");
    
    console.log("2. Testing with missing key...");
    delete process.env.ENCRYPTION_KEY;
    try {
      decrypt(encrypted);
      throw new Error("Should have failed without key!");
    } catch(e: any) {
      console.log("Missing key: Failed safely -", e.message);
    }
    
    console.log("3. Testing with WRONG key...");
    process.env.ENCRYPTION_KEY = Buffer.from("wrongkey123wrongkey123wrongkey12").toString("base64");
    try {
      decrypt(encrypted);
      throw new Error("Should have failed with wrong key!");
    } catch(e: any) {
      console.log("Wrong key: Failed safely -", e.message);
    }

  } catch(e: any) {
    console.error("Test failed:", e);
    process.exit(1);
  } finally {
    process.env.ENCRYPTION_KEY = originalKey;
  }
}

testEncryption();
