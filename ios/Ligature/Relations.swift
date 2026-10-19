import Foundation

// Relationships between contacts, and which people show as one entry in the list.
// Mirrors public/relations.js on the web.

/// For parent and manager, `a` is the parent or manager.
struct Relationship: Codable, Identifiable, Hashable {
    let id: String
    let a: String
    let b: String
    let kind: String
    let label: String
    let combined: Bool

    func other(than me: String) -> String { a == me ? b : a }
}

/// What the other person is to you.
enum RelationRole: String, CaseIterable, Identifiable {
    case spouse, partner, parent, child, sibling, relative, friend, colleague, manager, report, other
    var id: String { rawValue }

    var label: String {
        switch self {
        case .report: return "Reports to You"
        default: return rawValue.capitalized
        }
    }

    var kind: String {
        switch self {
        case .child: return "parent"
        case .report: return "manager"
        default: return rawValue
        }
    }

    /// Couples show together unless you say otherwise.
    var together: Bool { self == .spouse || self == .partner }

    /// For one-way kinds: whether the other person is the `a` end.
    var otherIsA: Bool? {
        switch self {
        case .parent, .manager: return true
        case .child, .report: return false
        default: return nil
        }
    }

    static func of(_ r: Relationship, me: String) -> RelationRole {
        let otherIsA = r.a != me
        return allCases.first { $0.kind == r.kind && ($0.otherIsA == nil || $0.otherIsA == otherIsA) } ?? .other
    }
}

extension Relationship {
    func label(for me: String) -> String {
        kind == "other" ? (label.isEmpty ? "Related" : label) : RelationRole.of(self, me: me).label
    }
}

enum Together {
    /// Everyone joined by relationships marked `combined`, directly or through someone else.
    /// Maps each contact ID to the members, in display order.
    static func groups(_ contacts: [ContactRow], _ rels: [Relationship]) -> [String: [ContactRow]] {
        let byId = Dictionary(contacts.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let joined = rels.filter { $0.combined && byId[$0.a] != nil && byId[$0.b] != nil }
        guard !joined.isEmpty else { return [:] }
        var parent: [String: String] = [:]
        func find(_ x: String) -> String {
            var x = x
            while let p = parent[x], p != x {
                parent[x] = parent[p] ?? p
                x = p
            }
            return x
        }
        for r in joined {
            for x in [r.a, r.b] where parent[x] == nil { parent[x] = x }
            parent[find(r.a)] = find(r.b)
        }
        var sets: [String: [ContactRow]] = [:]
        for x in parent.keys { sets[find(x), default: []].append(byId[x]!) }
        var out: [String: [ContactRow]] = [:]
        for members in sets.values {
            let ordered = order(members, joined)
            for m in ordered { out[m.id] = ordered }
        }
        return out
    }

    /// Parents before their children, managers before reports, then by first name.
    private static func order(_ members: [ContactRow], _ rels: [Relationship]) -> [ContactRow] {
        let ids = Set(members.map(\.id))
        let above = rels.filter { ($0.kind == "parent" || $0.kind == "manager") && ids.contains($0.a) && ids.contains($0.b) }
        var depth = Dictionary(uniqueKeysWithValues: members.map { ($0.id, 0) })
        for _ in members {
            for r in above { depth[r.b] = max(depth[r.b] ?? 0, (depth[r.a] ?? 0) + 1) }
        }
        let first = { (m: ContactRow) in (m.givenName.isEmpty ? m.displayName : m.givenName).lowercased() }
        return members.sorted {
            let da = depth[$0.id] ?? 0, db = depth[$1.id] ?? 0
            return da != db ? da < db : first($0) < first($1)
        }
    }

    private static func join(_ names: [String]) -> String {
        names.count <= 2 ? names.joined(separator: " & ") : names.dropLast().joined(separator: ", ") + " & " + names.last!
    }

    /// “Alex & Jamie Smith”, or “Alex Smith & Jamie Ortiz” when the last names differ.
    static func name(_ members: [ContactRow]) -> String {
        if let family = members.first?.familyName, !family.isEmpty,
           members.allSatisfy({ !$0.givenName.isEmpty && $0.familyName == family }) {
            return join(members.map(\.givenName)) + " " + family
        }
        return join(members.map { $0.displayName.isEmpty ? "No Name" : $0.displayName })
    }
}
