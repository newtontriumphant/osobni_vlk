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

const stationFields = ["start", "destination", "via1", "via2", "via3"];

stationFields.forEach(id => {
    const input = document.getElementById(id);
    const wrapper = document.createElement("div");
    wrapper.className = "station-field";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const results = document.createElement("div");
    results.className = "station-results";
    wrapper.appendChild(results);

    let timer;
    let controller;

    input.autocomplete = "off";

    input.addEventListener("input", () => {
        clearTimeout(timer);
        controller?.abort();
        results.replaceChildren();

        delete input.dataset.stopId;
        delete input.dataset.lat;
        delete input.dataset.lon;

        const query = input.value.trim();

        if (query.length < 3) return;

        timer = setTimeout(async () => {
            controller = new AbortController();

            try {
                const url = "https://api.transitous.org/api/v1/geocode"
                    + "?type=STOP&numResults=10&text="
                    + encodeURIComponent(query);

                const response = await fetch(url, {
                    signal: controller.signal
                });

                if (!response.ok) throw new Error("API error");

                const stations = await response.json();
                results.replaceChildren();

                stations.forEach(station => {
                    if (station.country &&
                        ![
                            "AT", "BE", "BG", "HR", "CY", "CZ", "DK",
                            "EE", "FI", "FR", "DE", "GR", "HU", "IE",
                            "IT", "LV", "LT", "LU", "MT", "NL", "PL",
                            "PT", "RO", "SK", "SI", "ES", "SE"
                        ].includes(station.country.toUpperCase())) {
                        return;
                    }

                    const option = document.createElement("button");
                    option.type = "button";
                    option.className = "station-option";
                    option.textContent = station.name;

                    option.addEventListener("click", () => {
                        input.value = station.name;
                        input.dataset.stopId = station.id;
                        input.dataset.lat = station.lat;
                        input.dataset.lon = station.lon;
                        results.replaceChildren();
                    });

                    results.appendChild(option);
                });

                if (!results.children.length) {
                    results.textContent = "No stations found";
                }
            } catch (error) {
                if (error.name !== "AbortError") {
                    results.textContent = "Search unavailable";
                    console.error(error);
                }
            }
        }, 350);
    });

    document.addEventListener("click", event => {
        if (!wrapper.contains(event.target)) {
            results.replaceChildren();
        }
    });
});

document.getElementById("route-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const from = document.getElementById("start");
    const to = document.getElementById("destination");

    if (!from.dataset.stopId || !to.dataset.stopId) {
        alert("Please select stations from the suggestions, and stop being such a free thinker! >:C");
        return;
    }

    const date = document.getElementById("travel-date").value;
    const time = document.getElementById("travel-time").value;

    const departure = new Date(`${date}T${time}`).toISOString();

    const params = new URLSearchParams({
        fromPlace: from.dataset.stopId,
        toPlace: to.dataset.stopId,
        time: departure,
        numItineraries: "10"
    });

    try {
        const response = await fetch(
            "https://api.transitous.org/api/v6/plan?" + params
        );

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const data = await response.json();

        showConnections(data.itineraries || []);

    } catch (error) {
        console.error(error);
        alert("Connection search failed! Make sure you're not looking more than a month in the past!");
    }
});

function getCarrier(leg) {
    const name = (leg.agencyName || "").toLowerCase();
    const train = (leg.displayName || "").toLowerCase();

    if (name.includes("flix")) {
        return { color: "#169b35", logo: "flixtrain.de" };
    }

    if (name.includes("ceske") || name.includes("české")) {
        return {
            color: train.includes("rj") ? "#1678c8" : "#183b75",
            logo: "cd.cz"
        };
    }

    if (name.includes("westbahn")) {
        return { color: "#008b8b", logo: "westbahn.at" };
    }

    if (name.includes("oebb") || name.includes("öbb")) {
        return { color: "#8b1630", logo: "oebb.at" };
    }

    if (name.includes("sncf") || name.includes("tgv")) {
        return { color: "#812B6D", logo: "sncf.fr" };
    }

    if (name.includes("regiojet") || name.includes("regio jet")) {
        return { color: "#ffcc40", logo: "regiojet.com" };
    }

    if (name.includes("db ") || name.includes("deutsche bahn")) {
        return { color: "#ec0016", logo: "bahn.de" };
    }

    return { color: "#596a75", logo: null };
}

function showConnections(itineraries) {
    const container = document.getElementById("connections");
    container.replaceChildren();

    if (!itineraries.length) {
        container.textContent = "No connections found.";
        return;
    }

    itineraries.forEach((journey, index) => {
        
        const card = document.createElement("div");
        card.className = "connection-card";

        const title = document.createElement("h3");
        title.textContent =
            `Connection ${index + 1}: ` +
            `${formatTime(journey.startTime)} → ${formatTime(journey.endTime)}`;
        card.appendChild(title);

        const info = document.createElement("p");
        info.textContent =
            `${Math.round(journey.duration / 60)} min · ` +
            `${journey.transfers} transfers`;
        card.appendChild(info);

        journey.legs.filter(leg => leg.mode !== "WALK").forEach(leg => {
            const line = document.createElement("div");
            line.className = "connection-leg";

            const carrier = getCarrier(leg);
            line.style.borderLeftColor = carrier.color;

            if (carrier.logo && leg.mode !== "WALK") {
                const logo = document.createElement("img");
                logo.src = "https://www.google.com/s2/favicons?sz=64&domain="
                    + carrier.logo;
                logo.className = "carrier-logo";
                logo.alt = leg.agencyName || "Carrier";
                line.appendChild(logo);
            }

            const details = document.createElement("div");

            const train = document.createElement("strong");
            train.textContent = leg.mode === "WALK"
                ? "Walk"
                : leg.displayName || leg.mode;
            details.appendChild(train);

            const stops = document.createElement("p");
            stops.textContent =
                `${leg.from?.name || "?"} → ${leg.to?.name || "?"}`;
            details.appendChild(stops);

            const times = document.createElement("small");
            times.textContent =
                `${formatTime(leg.startTime)} – ${formatTime(leg.endTime)}` +
                (leg.agencyName ? ` · ${leg.agencyName}` : "");
            details.appendChild(times);

            line.appendChild(details);
            card.appendChild(line);
        });

        container.appendChild(card);
    });
}

function formatTime(time) {
    return new Date(time).toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Berlin"
    });
}