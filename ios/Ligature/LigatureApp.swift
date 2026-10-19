import SwiftUI

@main
struct LigatureApp: App {
    @State private var store = Store()

    init() {
        // Contact photos come back often; keep them around between launches.
        URLCache.shared = URLCache(memoryCapacity: 32 << 20, diskCapacity: 256 << 20)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .task { await store.boot() }
        }
    }
}

struct RootView: View {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var store = store
        Group {
            switch store.phase {
            case .loading:
                ProgressView()
            case .signedOut:
                SignInView()
            case .ready:
                ContactsListView()
            }
        }
        // Check Google when you come back after a minute away, and every five minutes while open.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.checkIfStale(60) } }
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60 * 1_000_000_000)
                if scenePhase == .active { await store.checkIfStale(295) }
            }
        }
        .alert(store.alertTitle, isPresented: $store.showAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.alertMessage)
        }
    }
}
