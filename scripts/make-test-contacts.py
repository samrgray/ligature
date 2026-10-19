"""Write ~50 fake contacts as a Google Contacts import CSV.

All emails use example.com/.org/.net and all phone numbers use the 555-01xx
range reserved for fiction, so nothing here belongs to a real person.

    python3 scripts/make-test-contacts.py > test-contacts.csv
"""
import csv
import random
import sys

random.seed(7)

PEOPLE = [
    # first, last, company, title, labels
    ("Ava", "Chen", "Northwind Studio", "Design Lead", "Work"),
    ("Aaron", "Diaz", "Diaz & Co.", "Owner", ""),
    ("Ben", "Lowell", "", "", "Family"),
    ("Beatriz", "Okafor", "Harbor Health", "Physician", ""),
    ("Chris", "Park", "Northwind Studio", "Engineer", "Work"),
    ("Carmen", "Ruiz", "", "", "Neighbors"),
    ("Cole", "Whitaker", "Fieldwork", "Producer", "Work"),
    ("Devon", "Hale", "Hale Builders", "Contractor", ""),
    ("Dana", "Kim", "", "", "Family"),
    ("Eli", "Brandt", "Brandt Legal", "Attorney", ""),
    ("Elena", "Moreau", "Atelier M", "Founder", ""),
    ("Farah", "Siddiqui", "Lumen Labs", "Product Manager", "Work"),
    ("Felix", "Navarro", "", "", "Friends"),
    ("Grace", "Odum", "Maple Books", "Owner", "Neighbors"),
    ("Gabriel", "Stone", "Stone & Pine", "Architect", ""),
    ("Hannah", "Weiss", "Lumen Labs", "Researcher", "Work"),
    ("Hiro", "Tanaka", "", "", "Friends"),
    ("Imani", "Brooks", "Lincoln Elementary", "Teacher", "Neighbors"),
    ("Isaac", "Feld", "Feld Physical Therapy", "Therapist", ""),
    ("Jada", "Morris", "Northwind Studio", "Recruiter", "Work"),
    ("Jonah", "Albrecht", "", "", "Family"),
    ("Keiko", "Yamada", "Paper & Thread", "Illustrator", "Friends"),
    ("Kofi", "Mensah", "Mensah Advisory", "Accountant", ""),
    ("Lena", "Kowalski", "", "", "Family"),
    ("Liam", "O’Connor", "Greenline Transit", "Planner", ""),
    ("Maya", "Patel", "Lumen Labs", "Head of Design", "Work"),
    ("Marco", "Bellini", "Trattoria Bellini", "Chef", "Friends"),
    ("Nadia", "Haddad", "", "", "Friends"),
    ("Noah", "Fischer", "Fischer Dental", "Dentist", ""),
    ("Olivia", "Grant", "Grant Realty", "Agent", ""),
    ("Omar", "Rahman", "Northwind Studio", "CTO", "Work"),
    ("Priya", "Raman", "", "", "Friends"),
    ("Paul", "Dubois", "Atelier M", "Photographer", ""),
    ("Quinn", "Harper", "Harper Coaching", "Coach", ""),
    ("Rosa", "Alvarez", "", "", "Neighbors"),
    ("Ravi", "Shah", "Lumen Labs", "Engineer", "Work"),
    ("Sofia", "Lindqvist", "Nordic Supply", "Buyer", ""),
    ("Sam", "Okoye", "", "", "Friends"),
    ("Tara", "Quinlan", "Riverbend Vet", "Veterinarian", "Neighbors"),
    ("Theo", "Marsh", "Marsh Woodworks", "Carpenter", ""),
    ("Uma", "Krishnan", "Harbor Health", "Nurse Practitioner", ""),
    ("Victor", "Hugo-Reyes", "", "", "Family"),
    ("Wren", "Ellis", "Fieldwork", "Editor", "Work"),
    ("Will", "Ashby", "Ashby Insurance", "Broker", ""),
    ("Xena", "Papadakis", "", "", "Friends"),
    ("Yusuf", "Demir", "Demir Imports", "Owner", ""),
    ("Yara", "Nasser", "Lumen Labs", "Data Scientist", "Work"),
    ("Zoe", "Abernathy", "", "", "Family"),
    ("Zane", "Holloway", "Holloway Cycles", "Mechanic", "Neighbors"),
    ("", "", "Corner Hardware", "", ""),  # a business with no person name
]

# Invented street names, so no address points at a real house.
STREETS = ["Linden Fold Ln", "Quarry Bend Rd", "Tamsin Ct", "Orrin Way", "Halberd St",
           "Pellmore Ave", "Coldbrook Row", "Vesper Hill Rd", "Ashgrove Ter", "Marrow Ln"]
NOTES = ["Met at a design meetup.", "Prefers texts over calls.", "Kids go to Lincoln.",
         "Introduced by Maya.", "Owes me a book.", "Great for restaurant tips.", "", "", ""]

HEADERS = [
    "First Name", "Last Name", "Organization Name", "Organization Title", "Birthday", "Notes", "Labels",
    "E-mail 1 - Label", "E-mail 1 - Value", "E-mail 2 - Label", "E-mail 2 - Value",
    "Phone 1 - Label", "Phone 1 - Value", "Phone 2 - Label", "Phone 2 - Value",
    "Address 1 - Label", "Address 1 - Street", "Address 1 - City", "Address 1 - Region",
    "Address 1 - Postal Code", "Address 1 - Country",
    "Website 1 - Label", "Website 1 - Value",
]


def slug(s):
    return "".join(ch for ch in s.lower() if ch.isalnum())


def main():
    w = csv.writer(sys.stdout, lineterminator="\n")
    w.writerow(HEADERS)
    used_phones = set()

    def phone():
        while True:
            n = f"({random.choice(['503', '971'])}) 555-01{random.randint(0, 99):02d}"
            if n not in used_phones:
                used_phones.add(n)
                return n

    for i, (first, last, company, title, label) in enumerate(PEOPLE):
        person = bool(first or last)
        domain = random.choice(["example.com", "example.org", "example.net"])
        email1 = f"{slug(first)}.{slug(last)}@{domain}" if person else f"hello@{slug(company)[:12]}.example.com"
        email2 = f"{slug(first)}@{slug(company)[:12]}.example.com" if person and company and i % 3 == 0 else ""
        birthday = f"{random.randint(1965, 2000)}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}" if person and i % 4 != 3 else ""
        labels = " ::: ".join(x for x in ["* myContacts", label] if x)
        has_address = i % 3 != 1
        w.writerow([
            first, last, company, title, birthday, random.choice(NOTES) if person else "", labels,
            "Home" if person and not company else "Work", email1,
            "Work" if email2 else "", email2,
            "Mobile" if person else "Work", phone(),
            "Work" if company and person and i % 2 == 0 else "", phone() if company and person and i % 2 == 0 else "",
            "Home" if has_address else "",
            f"{random.randint(10, 9999)} {random.choice(STREETS)}" if has_address else "",
            "Portland" if has_address else "", "OR" if has_address else "",
            random.choice(["97202", "97209", "97214", "97211"]) if has_address else "", "US" if has_address else "",
            "Work" if company and i % 5 == 0 else "",
            f"https://{slug(company)[:16]}.example.com" if company and i % 5 == 0 else "",
        ])


if __name__ == "__main__":
    main()
