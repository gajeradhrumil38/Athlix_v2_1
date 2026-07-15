import Foundation

public enum RepositoryError: Error, Equatable {
    case network
    case decoding
    case unknown(String)
}
