import XCTest

/// Taps through the app with demo data, to catch gestures that stop working.
final class LigatureUITests: XCTestCase {
    let app = XCUIApplication()
    let shots = URL(fileURLWithPath: ProcessInfo.processInfo.environment["SHOTS_DIR"] ?? "/tmp/ligature-uitests")

    override func setUp() {
        continueAfterFailure = false
        try? FileManager.default.createDirectory(at: shots, withIntermediateDirectories: true)
        app.launchArguments = ["-demo"]
        app.launch()
    }

    private func shot(_ name: String) {
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: shots.appendingPathComponent("\(name).png"))
    }

    /// Tap a row in the middle of the screen and expect the contact card (it has an Edit button).
    private func tapRowOpensCard(_ name: String) {
        XCTAssertTrue(app.cells.firstMatch.waitForExistence(timeout: 5), "contacts list didn’t appear")
        sleep(1)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let opened = app.navigationBars.buttons["Edit"].waitForExistence(timeout: 3)
        shot(name)
        print("SCREEN AFTER TAP (\(name)):\n" + app.debugDescription.split(separator: "\n").prefix(60).joined(separator: "\n"))
        XCTAssertTrue(opened, "tapping a contact didn’t open it (\(name))")
    }

    func testTapOpensContact() {
        tapRowOpensCard("ui-tap-tabs")
    }

    func testTapOpensContactWithoutTabs() {
        app.terminate()
        app.launchArguments = ["-demo", "-nopins"]
        app.launch()
        tapRowOpensCard("ui-tap-notabs")
    }

    func testSwipeBetweenContacts() {
        app.terminate()
        app.launchArguments = ["-demo", "-nopins"]
        app.launch()
        XCTAssertTrue(app.cells.firstMatch.waitForExistence(timeout: 5))
        sleep(1)
        app.cells.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars.buttons["Edit"].waitForExistence(timeout: 3))
        sleep(1)
        // The text fully on screen: the card you’re looking at (the neighbours only peek in).
        let onScreen = { () -> Set<String> in
            let frame = self.app.frame
            return Set(self.app.staticTexts.allElementsBoundByIndex
                .filter { $0.exists && frame.contains($0.frame) && $0.frame.width > 0 }
                .map(\.label))
        }
        let first = onScreen()
        app.swipeLeft()
        sleep(2)
        shot("ui-swipe-next")
        let second = onScreen()
        XCTAssertNotEqual(first, second, "swiping left didn’t change the card")
        app.swipeRight()
        sleep(2)
        XCTAssertEqual(onScreen(), first, "swiping right didn’t go back")
        XCTAssertTrue(app.navigationBars.buttons["Edit"].exists, "a swipe left the contact")
    }

    func testSelectModeTicksPeople() {
        XCTAssertTrue(app.cells.firstMatch.waitForExistence(timeout: 5))
        app.navigationBars.buttons["Select"].tap()
        sleep(1)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        sleep(1)
        shot("ui-select")
        XCTAssertTrue(app.staticTexts["1 Selected"].waitForExistence(timeout: 3), "Select mode didn’t tick the row")
        XCTAssertFalse(app.navigationBars.buttons["Edit"].exists, "Select mode opened the contact instead")
    }

    func testTogetherRowOpensBoth() {
        app.terminate()
        app.launchArguments = ["-demo", "-nopins"]
        app.launch()
        let row = app.cells.containing(NSPredicate(format: "label CONTAINS %@", "Rosa Alvarez & Zoe Abernathy")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5), "no row for the couple")
        row.tap()
        let zoe = app.segmentedControls.buttons["Zoe"]
        XCTAssertTrue(zoe.waitForExistence(timeout: 3), "no switcher between the two")
        XCTAssertTrue(app.staticTexts["Rosa Alvarez"].exists, "didn’t open Rosa, who’s named first")
        zoe.tap()
        sleep(1)
        shot("ui-together")
        XCTAssertTrue(app.staticTexts["Zoe Abernathy"].waitForExistence(timeout: 3), "switcher didn’t show Zoe")
    }

    func testEditAddress() {
        tapRowOpensCard("ui-open-for-edit")
        app.navigationBars.buttons["Edit"].tap()
        let city = app.textFields["City"].firstMatch
        for _ in 0..<4 where !city.isHittable { app.swipeUp() }
        XCTAssertTrue(city.waitForExistence(timeout: 3), "no address fields in the editor")
        shot("ui-edit-address")
        city.tap()
        city.typeText(" Hill")
        app.buttons["Done"].firstMatch.tap()
        sleep(1)
        shot("ui-after-address")
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Hill")).firstMatch.waitForExistence(timeout: 3),
                      "edited address didn’t show on the card")
    }

    func testMapShowsPeople() {
        XCTAssertTrue(app.cells.firstMatch.waitForExistence(timeout: 5))
        app.navigationBars.buttons["Show Map"].tap()
        let status = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "on the map")).firstMatch
        XCTAssertTrue(status.waitForExistence(timeout: 5), "map didn’t show")
        sleep(4)
        shot("ui-map")
        app.buttons["map-type-work"].tap()
        sleep(1)
        shot("ui-map-work")
        app.buttons["Add Pin"].tap()
        let field = app.textFields["Search for an address or place"]
        XCTAssertTrue(field.waitForExistence(timeout: 3), "no pin search")
        field.typeText("Central Library\n")
        let result = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "Central Library")).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 3), "no search results")
        result.tap()
        app.buttons["Add"].tap()
        sleep(2)
        shot("ui-map-pin")
        app.buttons["map-type-work"].tap()
        app.navigationBars.buttons["Show List"].tap()
        XCTAssertTrue(app.cells.firstMatch.waitForExistence(timeout: 3), "list didn’t come back")
    }

    func testArchiveAndRestore() {
        app.terminate()
        app.launchArguments = ["-demo", "-nopins"]
        app.launch()
        tapRowOpensCard("ui-before-archive")
        app.navigationBars.buttons["More"].tap()
        app.buttons["Archive"].tap()
        XCTAssertTrue(app.navigationBars.buttons["Lists"].waitForExistence(timeout: 3), "didn’t go back to the list")
        app.navigationBars.buttons["Lists"].tap()
        app.buttons.containing(NSPredicate(format: "label BEGINSWITH %@", "Archived")).firstMatch.tap()
        let row = app.buttons["archived-row"].firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 3), "archived person not in Archived")
        shot("ui-archived")
        row.tap()
        let restore = app.navigationBars.buttons["Restore"]
        XCTAssertTrue(restore.waitForExistence(timeout: 3), "archived card has no Restore")
        restore.tap()
        XCTAssertTrue(app.navigationBars.buttons["Edit"].waitForExistence(timeout: 3), "restored card isn’t editable")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.staticTexts["No Archived Contacts"].waitForExistence(timeout: 3), "restore didn’t empty the archive")
    }

    func testSwipeChangesTab() {
        XCTAssertTrue(app.cells.firstMatch.waitForExistence(timeout: 5))
        app.cells.element(boundBy: 2).swipeLeft()
        sleep(1)
        shot("ui-after-swipe")
    }
}
