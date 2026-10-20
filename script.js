const map = L.map('map').setView([51.1657, 10.4515], 6);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    referrerPolicy: 'strict-origin-when-cross-origin'
}).addTo(map);

// authupd

function updateAuthUI() {
    const loggedIn = !!currentUser;

    document.querySelector(".login").hidden = loggedIn;
    document.getElementById("route-search").hidden = !loggedIn;

    document.getElementById("user-status").textContent =
        loggedIn ? "Logged in as: " + currentUser : "";
}

// login

let currentUser = null;

function updateLoginStatus() {
    const status = document.getElementById("login-status");

    if (currentUser) {
        status.textContent = "✓ Logged in as: " + currentUser;
        status.classList.add("logged-in");
    } else {
        status.textContent = "✕ Not logged in";
        status.classList.remove("logged-in");
    }
}  

let savedRoutes = [];
let routeLayers = [];

async function login(username) {
    const response = await fetch("/api/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ username })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Login failed");
    }

    currentUser = data.username;
    savedRoutes = data.routes;

    updateLoginStatus();
    updateAuthUI();

    routeLayers.forEach(layer => map.removeLayer(layer));

    routeLayers = savedRoutes.map(route =>
        L.polyline(route.points, {
            color: route.color
        }).addTo(map)
    );

    localStorage.setItem("username", currentUser);
    console.log("Logged in as:", currentUser);
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value;

    try {
        await login(username);
    } catch (error) {
        alert(error.message);
    }
});

document.getElementById("logout-button").addEventListener("click", () => {
    currentUser = null;
    savedRoutes = [];

    routeLayers.forEach(layer => map.removeLayer(layer));
    routeLayers = [];

    localStorage.removeItem("username");
    document.getElementById("username").value = "";

    updateLoginStatus();
    updateAuthUI();
    console.log("Logged out");
});

async function saveRoute(points, color) {
    if (!currentUser) {
        alert("Please login first!");
        return;
    }

    const routes = [...savedRoutes, { points, color }];

    const response = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: currentUser,
            routes
        })
    });

    if (!response.ok) {
        throw new Error("Speichern fehlgeschlagen");
    }

    savedRoutes = routes;
    routeLayers.push(
        L.polyline(points, { color }).addTo(map)
    );
}

const lastUser = localStorage.getItem("username");

if (lastUser) {
    document.getElementById("username").value = lastUser;
    login(lastUser).catch(console.error);
}
