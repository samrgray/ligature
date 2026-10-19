import SwiftUI

struct ContactDetailView: View {
    let id: String
    @Environment(Store.self) private var store
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @State private var editing = false
    @State private var pickingLists = false
    @State private var showPhoto = false
    @State private var editingRelationship: RelationshipEditTarget?

    private var row: ContactRow? { store.row(id) }
    private var archived: ContactDetail.Archived? { detail?.archived }
    @State private var confirmForget = false
    @State private var working = false
    private var detail: ContactDetail? { store.details[id] }

    var body: some View {
        ScrollViewReader { proxy in
        List {
            header
            if let d = detail {
                googleSections(d)
            } else if row != nil {
                Section { HStack { Spacer(); ProgressView(); Spacer() } }
            }
            if let archived {
                Section {
                    Text("Archived \(Date(timeIntervalSince1970: archived.at / 1000).formatted(date: .abbreviated, time: .omitted)). Not in Google Contacts; everything is kept here. Restore puts them back in Google\(archived.groups.contains { $0 != "contactGroups/myContacts" } ? ", on the same lists" : "").")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else {
                if let row { listsSection(row) }
                if row != nil { RelationshipsSection(id: id, editing: $editingRelationship) }
            }
            yourFields.id("fields")
        }
        .onAppear {
            if store.demo, store.demoScreen == "fields" {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { proxy.scrollTo("fields", anchor: .top) }
            }
        }
        }
        .listStyle(.insetGrouped)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if archived != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button(role: .destructive) { confirmForget = true } label: { Label("Delete Forever", systemImage: "trash") }
                    } label: { Image(systemName: "ellipsis.circle") }
                    .accessibilityLabel("More")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Restore") {
                        working = true
                        Task {
                            await store.archive(.restore, ids: [id])
                            await store.loadDetail(id)
                            working = false
                        }
                    }
                    .bold()
                    .disabled(working)
                }
            } else {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            working = true
                            Task {
                                let done = await store.archive(.archive, ids: [id], etags: [id: detail?.etag ?? ""])
                                working = false
                                if !done.isEmpty { dismiss() }
                            }
                        } label: { Label("Archive", systemImage: "archivebox") }
                    } label: { Image(systemName: "ellipsis.circle") }
                    .accessibilityLabel("More")
                    .disabled(detail == nil || working)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Edit") { editing = true }
                        .disabled(detail == nil)
                }
            }
        }
        .confirmationDialog("Delete this contact forever?", isPresented: $confirmForget, titleVisibility: .visible) {
            Button("Delete Forever", role: .destructive) {
                Task {
                    await store.archive(.forget, ids: [id])
                    dismiss()
                }
            }
        } message: {
            Text("Their details, your fields and relationships are removed from Ligature. This can’t be undone.")
        }
        .task(id: id) { await store.loadDetail(id) }
        .sheet(isPresented: $editing) {
            if let d = detail {
                ContactEditView(mode: .edit(d), onDeleted: { dismiss() })
            }
        }
        .sheet(isPresented: $pickingLists) {
            if let row { ListPickerView(ids: [row.id], accountId: row.accountId) }
        }
        .sheet(item: $editingRelationship) { t in
            RelationshipEditor(me: t.me, existing: t.existing)
        }
        .fullScreenCover(isPresented: $showPhoto) {
            PhotoViewer(url: detail?.card.photoUrl ?? row?.photoUrl ?? "")
        }
        .onAppear {
            guard store.demo else { return }
            if store.demoScreen == "edit" { editing = true }
            if store.demoScreen == "lists" { pickingLists = true }
            if store.demoScreen == "relate" { editingRelationship = RelationshipEditTarget(me: id, existing: store.relationships(of: id).first) }
        }
    }

    // MARK: Header: photo, name, and message / call / email

    private var header: some View {
        let card = detail?.card
        let photo = card?.photoUrl ?? row?.photoUrl ?? ""
        let name = card?.displayName ?? row?.displayName ?? ""
        let subtitle = [card?.title ?? row?.title ?? "", card?.organization ?? row?.organization ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
        let phones = unique(card?.phones ?? (row.map { $0.phone.isEmpty ? [] : [Labeled(value: $0.phone, label: "")] } ?? []))
        let emails = unique(card?.emails ?? (row.map { $0.email.isEmpty ? [] : [Labeled(value: $0.email, label: "")] } ?? []))
        return Section {
            VStack(spacing: 10) {
                Button { if !photo.isEmpty { showPhoto = true } } label: {
                    Avatar(url: photo, initials: card?.initials ?? row?.initials ?? "?", size: 104)
                }
                .buttonStyle(.plain)
                .disabled(photo.isEmpty)
                .accessibilityLabel(photo.isEmpty ? "No photo" : "Enlarge photo")
                Text(name.isEmpty ? "No Name" : name)
                    .font(.title.weight(.semibold))
                    .multilineTextAlignment(.center)
                if !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                HStack(spacing: 8) {
                    ActionButton(title: "message", icon: "message.fill", options: phones) { Links.sms($0) }
                    ActionButton(title: "call", icon: "phone.fill", options: phones) { Links.tel($0) }
                    ActionButton(title: "mail", icon: "envelope.fill", options: emails) { Links.mail($0) }
                    if onSignal {
                        if phones.isEmpty {
                            Button {
                                copyToClipboard(name)
                                if let u = URL(string: "sgnl://") { openURL(u) }
                            } label: { ActionFace(title: "signal", icon: "bubble.left.and.bubble.right.fill", enabled: true) }
                            .buttonStyle(.plain)
                            .accessibilityHint("Copies their name and opens Signal, so you can paste it into search")
                        } else {
                            ActionButton(title: "signal", icon: "bubble.left.and.bubble.right.fill", options: phones) { Address.signal($0) }
                        }
                    }
                }
                .padding(.top, 6)
            }
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
        }
    }

    private var onSignal: Bool {
        guard detail?.archived == nil, let f = store.fields.first(where: { $0.key == "signal" }) else { return false }
        return (row?.fields[f.id] ?? detail?.fields[f.id]) == "1"
    }

    private func unique(_ list: [Labeled]) -> [Labeled] {
        var seen = Set<String>()
        return list.filter { seen.insert($0.value.lowercased().filter { !$0.isWhitespace }).inserted }
    }

    // MARK: What Google has

    @ViewBuilder
    private func googleSections(_ d: ContactDetail) -> some View {
        let c = d.card
        if !c.phones.isEmpty {
            Section {
                ForEach(c.phones) { p in
                    ValueRow(label: p.label.isEmpty ? "phone" : p.label, value: p.value, url: Links.tel(p.value)) {
                        Button { if let u = Links.sms(p.value) { openURL(u) } } label: { Image(systemName: "message.fill") }
                            .buttonStyle(.borderless)
                            .accessibilityLabel("Message \(p.value)")
                    } menu: {
                        Button { if let u = Links.tel(p.value) { openURL(u) } } label: { Label("Call", systemImage: "phone") }
                        Button { if let u = Links.sms(p.value) { openURL(u) } } label: { Label("Message", systemImage: "message") }
                    }
                }
            }
        }
        if !c.emails.isEmpty {
            Section {
                ForEach(c.emails) { e in
                    ValueRow(label: e.label.isEmpty ? "email" : e.label, value: e.value, url: Links.mail(e.value))
                }
            }
        }
        if !c.addresses.isEmpty {
            Section {
                ForEach(c.addresses) { a in
                    ValueRow(label: a.label.isEmpty ? "address" : a.label, value: a.value, url: Links.maps(a.value), tinted: false)
                }
            }
        }
        if !c.urls.isEmpty {
            Section {
                ForEach(c.urls) { u in
                    ValueRow(label: u.label.isEmpty ? "website" : u.label, value: u.value, url: Links.web(u.value))
                }
            }
        }
        if !c.birthday.isEmpty || !c.events.isEmpty || !c.relations.isEmpty {
            Section {
                if !c.birthday.isEmpty { ValueRow(label: "birthday", value: c.birthday, url: nil, tinted: false) }
                ForEach(c.events) { e in ValueRow(label: e.label.isEmpty ? "date" : e.label, value: e.value, url: nil, tinted: false) }
                ForEach(c.relations) { r in ValueRow(label: r.label.isEmpty ? "related" : r.label, value: r.value, url: nil, tinted: false) }
            }
        }
        if !c.notes.isEmpty {
            Section { ValueRow(label: "notes", value: c.notes, url: nil, tinted: false) }
        }
    }

    // MARK: Lists

    private func listsSection(_ row: ContactRow) -> some View {
        let names = store.lists(for: row.accountId).filter { row.groups.contains($0.id) }.map(\.name)
        return Section {
            Button { pickingLists = true } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("lists").font(.subheadline).foregroundStyle(Color(.secondaryLabel))
                        Text(names.isEmpty ? "Add to a List" : names.joined(separator: ", "))
                            .foregroundStyle(names.isEmpty ? Color.accentColor : Color.primary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color(.tertiaryLabel))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: Your fields

    private var yourFields: some View {
        Section {
            if store.fields.isEmpty {
                Text("No fields yet. Add them in Ligature on the web.").foregroundStyle(.secondary)
            }
            ForEach(store.fields) { f in
                FieldEditor(contactId: id, field: f, stored: row?.fields[f.id] ?? detail?.fields[f.id] ?? "")
            }
        } header: {
            Text("Your Fields")
        } footer: {
            Text("Only in Ligature. Never synced to Google, iPhone or Mac.")
        }
    }
}

/// Message, call or mail. With more than one number or address, a menu to pick one.
struct ActionButton: View {
    let title: String
    let icon: String
    let options: [Labeled]
    let link: (String) -> URL?
    @Environment(\.openURL) private var openURL

    var body: some View {
        Group {
            if options.count > 1 {
                Menu {
                    ForEach(options) { o in
                        Button { if let u = link(o.value) { openURL(u) } } label: {
                            Text(o.value)
                            if !o.label.isEmpty { Text(o.label) }
                        }
                    }
                } label: { face }
            } else {
                Button { if let v = options.first?.value, let u = link(v) { openURL(u) } } label: { face }
                    .disabled(options.isEmpty)
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            ForEach(options) { o in
                Button { copyToClipboard(o.value) } label: { Label("Copy \(o.value)", systemImage: "doc.on.doc") }
            }
        }
    }

    private var face: some View { ActionFace(title: title, icon: icon, enabled: !options.isEmpty) }
}

struct ActionFace: View {
    let title: String
    let icon: String
    let enabled: Bool

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 18, weight: .medium))
            Text(title).font(.caption2.weight(.medium))
        }
        .foregroundStyle(enabled ? Color.accentColor : Color.secondary)
        .frame(maxWidth: .infinity, minHeight: 56)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color(.secondarySystemGroupedBackground)))
        .opacity(enabled ? 1 : 0.6)
    }
}

/// A labelled value. Tapping opens it (call, mail, map); long-press to copy.
struct ValueRow<Trailing: View, Extra: View>: View {
    let label: String
    let value: String
    let url: URL?
    var tinted = true
    @ViewBuilder var trailing: () -> Trailing
    @ViewBuilder var menu: () -> Extra
    @Environment(\.openURL) private var openURL

    var body: some View {
        HStack {
            if let url {
                Button { openURL(url) } label: { content }
                    .buttonStyle(.plain)
            } else {
                content
            }
            trailing()
        }
        .contextMenu {
            menu()
            Button { copyToClipboard(value) } label: { Label("Copy", systemImage: "doc.on.doc") }
        }
    }
}

extension ValueRow {
    fileprivate var content: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.subheadline).foregroundStyle(Color(.secondaryLabel))
            Text(value)
                .foregroundStyle(tinted && url != nil ? Color.accentColor : Color.primary)
                .multilineTextAlignment(.leading)
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

extension ValueRow where Trailing == EmptyView, Extra == EmptyView {
    init(label: String, value: String, url: URL?, tinted: Bool = true) {
        self.init(label: label, value: value, url: url, tinted: tinted, trailing: { EmptyView() }, menu: { EmptyView() })
    }
}

/// One of your own fields, edited in place. Saves when you leave it or press return.
struct FieldEditor: View {
    let contactId: String
    let field: FieldDef
    let stored: String
    @Environment(Store.self) private var store
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if field.type != "checkbox" {
                Text(field.label).font(.subheadline).foregroundStyle(.secondary)
            }
            switch field.type {
            case "checkbox":
                Toggle(field.label, isOn: Binding(get: { text == "1" }, set: { text = $0 ? "1" : ""; save() }))
            case "date": dateEditor
            case "longtext":
                TextField("Add", text: $text, axis: .vertical)
                    .lineLimit(1...10)
                    .focused($focused)
            default:
                TextField(field.type == "url" ? "https://" : "Add", text: $text)
                    .keyboardType(field.type == "url" ? .URL : .default)
                    .textInputAutocapitalization(field.type == "url" ? .never : .sentences)
                    .autocorrectionDisabled(field.type == "url")
                    .focused($focused)
                    .submitLabel(.done)
                    .onSubmit(save)
            }
        }
        .onAppear { text = stored }
        .onChange(of: stored) { _, v in if !focused { text = v } }
        .onChange(of: focused) { _, isFocused in if !isFocused { save() } }
    }

    @ViewBuilder
    private var dateEditor: some View {
        if let date = Self.day.date(from: text) {
            HStack {
                DatePicker(field.label, selection: Binding(get: { date }, set: { text = Self.day.string(from: $0); save() }), displayedComponents: .date)
                    .labelsHidden()
                Spacer()
                Button { text = ""; save() } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary) }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Clear \(field.label)")
            }
        } else {
            Button("Add Date") { text = Self.day.string(from: Date()); save() }
                .buttonStyle(.borderless)
        }
    }

    private func save() {
        guard text != stored else { return }
        let value = text
        Task { await store.saveField(contactId, fieldId: field.id, value: value) }
    }

    static let day: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}

/// The photo, full screen. Tap anywhere to close.
struct PhotoViewer: View {
    let url: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            AsyncImage(url: Photo.url(url, px: 1200)) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFit()
                } else {
                    ProgressView().tint(.white)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(.white.opacity(0.18)))
            }
            .padding()
            .accessibilityLabel("Close")
        }
        .onTapGesture { dismiss() }
    }
}
