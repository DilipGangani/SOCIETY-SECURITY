function requireAdmin() {
  const isLoginPage = location.pathname.endsWith("login.html");
  const session = localStorage.getItem("adminSession");

  if (!session && !isLoginPage) {
    location.href = "login.html";
  }
}

requireAdmin();


let db = JSON.parse(localStorage.getItem("societyDB"));

if (!db) {
  fetch("data.json")
    .then(res => res.json())
    .then(data => {
      db = data;
      saveDB();
      renderDashboard();
    });
} else {
  renderDashboard();
}


function daysBetween(date1, date2) {
  return Math.floor((date2 - date1) / (1000 * 60 * 60 * 24));
}

function insuranceActive(member) {
  const start = new Date(member.membershipStartDate);
  const today = new Date();
  return daysBetween(start, today) >= 90 && member.status === "Active";
}

function renderDashboard() {
  const totalMembers = db.members.length;
  const activeMembers = db.members.filter(m => m.status === "Active").length;
  const insuranceEnabled = db.members.filter(m => insuranceActive(m)).length;
  const pendingReceipts = db.receipts.filter(r => r.paymentStatus === "Unpaid").length;
  const defaulters = db.receipts.filter(r => r.paymentStatus === "Defaulted").length;

  setText("totalMembers", totalMembers);
  setText("activeMembers", activeMembers);
  setText("insuranceActive", insuranceEnabled);
  setText("pendingReceipts", pendingReceipts);
  setText("defaulters", defaulters);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* === RECEIPT GENERATION ON DEATH EVENT === */

function generateReceiptsForDeath(deathEventId) {
  const deathEvent = db.deathEvents.find(d => d.deathEventId === deathEventId);
  if (!deathEvent) return;

  db.members.forEach(member => {
    if (insuranceActive(member)) {
      const receiptExists = db.receipts.some(
        r => r.deathEventId === deathEventId && r.memberId === member.memberId
      );

      if (!receiptExists) {
        db.receipts.push({
          receiptId: "RCPT-" + Math.random().toString(36).substring(2, 7),
          deathEventId: deathEventId,
          memberId: member.memberId,
          baseAmount: 150,
          penalty: 0,
          totalAmount: 150,
          paymentStatus: "Unpaid"
        });
      }
    }
  });

  renderDashboard();
  saveDB();
}

/* === PAYMENT LOGIC === */

function markReceiptPaid(receiptId) {
  const receipt = db.receipts.find(r => r.receiptId === receiptId);
  if (!receipt) return;

  receipt.paymentStatus = "Paid";
  receipt.paidDate = new Date().toISOString().split("T")[0];

  saveDB();
  renderDashboard();
}


/* === OVERDUE CHECK (DUE + GRACE) === */

function applyPenaltyAndDefaults() {
  const today = new Date();

  db.deathEvents.forEach(event => {
    const due = new Date(event.dueDate);
    const grace = new Date(event.graceDate);

    db.receipts.forEach(receipt => {
      if (receipt.deathEventId === event.deathEventId) {
        if (today > due && receipt.paymentStatus === "Unpaid") {
          receipt.penalty = 100;
          receipt.totalAmount = 250;
        }
        if (today > grace && receipt.paymentStatus === "Unpaid") {
          receipt.paymentStatus = "Defaulted";
          terminateMember(receipt.memberId);
        }
      }
    });
  });

  saveDB();
  renderDashboard();
}

function terminateMember(memberId) {
  const member = db.members.find(m => m.memberId === memberId);
  if (member) {
    member.status = "Terminated";
    saveDB();
  }
}


function saveDB() {
  localStorage.setItem("societyDB", JSON.stringify(db));
}

function resetSystem() {
  localStorage.removeItem("societyDB");
  location.reload();
}

function downloadCSV(filename, rows) {
  if (!rows || !rows.length) {
    alert("No data to export");
    return;
  }

  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(","),
    ...rows.map(row =>
      headers.map(h => `"${(row[h] ?? "").toString().replace(/"/g, '""')}"`).join(",")
    )
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function logout() {
  localStorage.removeItem("adminSession");
  location.href = "login.html";
}
