import XCTest
@testable import AthlixCore

final class NonceGeneratorTests: XCTestCase {
    func testGeneratesRequestedLength() {
        let nonce = NonceGenerator.randomNonce(length: 32)
        XCTAssertEqual(nonce.count, 32)
    }

    func testGeneratesDifferentValuesEachCall() {
        let first = NonceGenerator.randomNonce(length: 32)
        let second = NonceGenerator.randomNonce(length: 32)
        XCTAssertNotEqual(first, second)
    }

    func testSha256ProducesSixtyFourCharHexString() {
        let hash = NonceGenerator.sha256("test-nonce")
        XCTAssertEqual(hash.count, 64)
        XCTAssertEqual(hash, hash.lowercased())
    }
}
