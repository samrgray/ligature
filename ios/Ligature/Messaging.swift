import Foundation

// Message templates, the same rules as the web app (public/messaging.js):
// {{First name}} fills in a value; {{First name|there}} uses “there” when it’s blank.

enum Channel: String, CaseIterable, Identifiable {
    case text, email, whatsapp, signal
    var id: String { rawValue }

    var label: String {
        switch self {
        case .text: return "Text"
        case .email: return "Email"
        case .whatsapp: return "WhatsApp"
        case .signal: return "Signal"
        }
    }

    var needsEmail: Bool { self == .email }
    /// Text and email can go to everyone at once; WhatsApp and Signal links open one chat.
    var canGroup: Bool { self == .text || self == .email }
}

enum Template {
    static let builtins = ["First name", "Last name", "Full name", "Company", "Job title"]

    private static let tag = try! NSRegularExpression(pattern: #"\{\{\s*([^{}|]+?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}"#)

    private static func norm(_ s: String) -> String {
        s.trimmingCharacters(in: .whitespaces).lowercased().split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// The value of a tag for one person, or nil if there’s no such tag.
    static func value(_ label: String, for p: Person?, fields: [FieldDef]) -> String? {
        switch norm(label) {
        case "first name": return p?.givenName ?? ""
        case "last name": return p?.familyName ?? ""
        case "full name", "name": return p?.displayName ?? ""
        case "company": return p?.organization ?? ""
        case "job title", "title": return p?.title ?? ""
        default: break
        }
        guard let f = fields.first(where: { norm($0.label) == norm(label) }) else { return nil }
        let v = p?.fields[f.id] ?? ""
        return f.type == "date" ? longDate(v) : v
    }

    static func tags(in text: String) -> [(label: String, fallback: String?)] {
        let ns = text as NSString
        return tag.matches(in: text, range: NSRange(location: 0, length: ns.length)).map { m in
            let label = ns.substring(with: m.range(at: 1))
            let fb = m.range(at: 2).location == NSNotFound ? nil : ns.substring(with: m.range(at: 2))
            return (label, fb)
        }
    }

    static func unknown(_ texts: [String], fields: [FieldDef]) -> [String] {
        var out: [String] = []
        for t in texts {
            for (label, _) in tags(in: t) where value(label, for: nil, fields: fields) == nil && !out.contains(label) {
                out.append(label)
            }
        }
        return out
    }

    /// Fill in the tags. `blanks` lists tags that came out empty with no fallback.
    static func render(_ text: String, for p: Person, fields: [FieldDef]) -> (text: String, blanks: [String]) {
        let ns = text as NSString
        var out = ""
        var last = 0
        var blanks: [String] = []
        for m in tag.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            out += ns.substring(with: NSRange(location: last, length: m.range.location - last))
            let label = ns.substring(with: m.range(at: 1))
            let fallback = m.range(at: 2).location == NSNotFound ? nil : ns.substring(with: m.range(at: 2))
            if let v = value(label, for: p, fields: fields) {
                if !v.trimmingCharacters(in: .whitespaces).isEmpty {
                    out += v
                } else if let fallback {
                    out += fallback
                } else {
                    blanks.append(label.trimmingCharacters(in: .whitespaces))
                }
            } else {
                out += ns.substring(with: m.range)
            }
            last = m.range.location + m.range.length
        }
        out += ns.substring(from: last)
        return (out, blanks)
    }

    private static func longDate(_ v: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: v) else { return v }
        return d.formatted(date: .long, time: .omitted)
    }
}

enum Address {
    static func defaultPhone(_ phones: [Labeled]) -> String {
        (phones.first { $0.label.range(of: "mobile|cell|iphone", options: [.regularExpression, .caseInsensitive]) != nil } ?? phones.first)?.value ?? ""
    }

    static func defaultEmail(_ emails: [Labeled]) -> String { emails.first?.value ?? "" }

    /// +15551234567. Numbers without a country code are taken as US/Canada.
    static func e164(_ raw: String) -> String {
        let s = raw.trimmingCharacters(in: .whitespaces)
        let d = s.filter(\.isNumber)
        if d.isEmpty { return "" }
        if s.hasPrefix("+") { return "+" + d }
        if s.hasPrefix("00") { return "+" + d.dropFirst(2) }
        if d.count == 10 { return "+1" + d }
        return "+" + d
    }

    static func whatsapp(_ number: String, body: String) -> URL? {
        var c = URLComponents(string: "https://wa.me/\(e164(number).dropFirst())")
        c?.queryItems = [URLQueryItem(name: "text", value: body)]
        return c?.url
    }

    /// Signal links open the chat but can’t carry text; the message is copied first.
    static func signal(_ number: String) -> URL? { URL(string: "https://signal.me/#p/\(e164(number))") }

    static func sms(_ numbers: [String], body: String) -> URL? {
        let b = body.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&=+"))) ?? ""
        let list = numbers.map(e164)
        if list.count == 1 { return URL(string: "sms:\(list[0])&body=\(b)") }
        return URL(string: "sms://open?addresses=\(list.joined(separator: ","))&body=\(b)")
    }
}
