const map = L.map('map').setView([51.1657, 10.4515], 6);
const trainRenderer = L.canvas({ tolerance: 3 });

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

    routeLayers = [];

    savedRoutes.forEach(route => {
        if (route.legs) {
            drawConnection(route);
        } else {
            routeLayers.push(
                L.polyline(route.points, {
                    color: route.color
                }).addTo(map)
            );
        }
    });

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

async function updateSavedRoutes(routes) {
    if (!currentUser) {
        throw new Error("Please login first!");
    }

    const response = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: currentUser,
            routes: routes
        })
    });

    if (!response.ok) {
        throw new Error("Saving failed!");
    }

    savedRoutes = routes;
}

function drawConnection(connection) {
    const lines = connection.legs.map(leg => {
        const line = L.polyline(
            L.PolylineUtil.decode(leg.points, leg.precision || 6),
            {
                color: getCarrier({
                    agencyName: leg.carrier,
                    displayName: leg.train
                }).color,
                weight: 5,
                renderer: trainRenderer
            }
        ).addTo(map);

        const date = new Date(leg.startTime).toLocaleDateString(
            "de-DE",
            { timeZone: "Europe/Berlin" }
        );
        const tooltip = document.createElement("div");
        tooltip.className = "train-tooltip";

        const carrierInfo = getCarrier({
            agencyName: leg.carrier,
            displayName: leg.train
        });

        tooltip.innerHTML = `
            <div class="train-tooltip-top">
                ${
                    carrierInfo.logo
                        ? `<img src="https://www.google.com/s2/favicons?sz=64&domain=${carrierInfo.logo}" class="train-tooltip-logo" alt="${leg.carrier}">`
                        : ""
                }
                <strong>${leg.train}</strong>
            </div>
            <div class="train-tooltip-time">
                ${date} · ${formatTime(leg.startTime)} - ${formatTime(leg.endTime)}
            </div>
            <div class="train-tooltip-carrier">
                ${leg.carrier}
            </div>
        `;


        line.bindTooltip(tooltip, {
            sticky: true,
            direction: "top",
            offset: [0, -8],
            className: "custom-train-tooltip"
        });

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Kill Wolves! :p";
        deleteButton.className = "delete-connection";

        deleteButton.addEventListener("click", async () => {
            try {
                const remaining = savedRoutes.filter(
                    route => route !== connection
                );

                await updateSavedRoutes(remaining);

                lines.forEach(layer => map.removeLayer(layer));

                routeLayers = routeLayers.filter(
                    layer => !lines.includes(layer)
                );

                map.closePopup();

            } catch (error) {
                alert(error.message);
            }
        });

        const popup = tooltip.cloneNode(true);
        popup.appendChild(deleteButton);

        line.bindPopup(popup, {
            className: "custom-train-popup",
        });

        return line;
    });

    lines.slice(0, -1).forEach(line => {
        const points = line.getLatLngs();
        const position = points[points.length - 1];

        const marker = L.circleMarker(position, {
            radius: 6,
            color: "#ffffff",
            weight: 2,
            fillColor: "#19262a",
            fillOpacity: 1,
            renderer: trainRenderer
        }).addTo(map);

        marker.on("click", () => {
            line.openPopup(marker.getLatLng());
        });

        lines.push(marker);
    })

    routeLayers.push(...lines);

    return lines;
}

const lastUser = localStorage.getItem("username");

if (lastUser) {
    document.getElementById("username").value = lastUser;
    login(lastUser).catch(console.error);
}

const stationFields = ["start", "destination", "via1", "via2"];

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

    const vias = ["via1", "via2"]
        .map(id => document.getElementById(id))
        .filter(input => input.value.trim());
    
    if (vias.some(input => !input.dataset.stopId)) {
        alert("Please select via stations from the suggestions, and stop being such a free thinker! >:C");
        return;
    }

    if (vias.length) {
        params.set(
            "via",
            vias.map(input => input.dataset.stopId).join(",")
        );
    }

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

    // please note: the below part is AI as I cannot feasibly add 100 carriers without inflating my time :3

    
    // ==========================================
    // BERLIN & BRANDENBURG
    // ==========================================

    // S-Bahn Berlin
    if (name.includes("s-bahn berlin") || name.includes("berliner s-bahn")) {
        return { color: "#008d58", logo: "sbahn.berlin" };
    }

    // BVG: U-Bahn, Straßenbahn, Bus, Fähre
    if (name.includes("bvg") || name.includes("berliner verkehrsbetriebe")) {
        const u = train.match(/^u\s*([1-9])\b/);

        const uColors = {
            1: "#7dad4c",
            2: "#e63f4b",
            3: "#16683d",
            4: "#f0d722",
            5: "#77563e",
            6: "#8d5ca6",
            7: "#009bd4",
            8: "#004a7c",
            9: "#f3791d"
        };

        if (u) {
            return { color: uColors[u[1]], logo: "bvg.de" };
        }

        if (/^(tram|straßenbahn|strassenbahn)\b/.test(train) ||
            /^m(?:1|2|4|5|6|8|10|13|17)\b/.test(train)) {
            return { color: "#d73747", logo: "bvg.de" };
        }

        if (/^(ferry|fähre|faehre|f10\b|f11\b|f12\b|f21\b|f23\b)/.test(train)) {
            return { color: "#168eae", logo: "bvg.de" };
        }

        return { color: "#f2c900", logo: "bvg.de" };
    }

    // ViP: Potsdam tram and bus
    if (name === "vip" || name.startsWith("vip ") ||
        name.includes("verkehrsbetrieb potsdam")) {
        return { color: "#e94a32", logo: "vip-potsdam.de" };
    }

    // Schöneicher-Rüdersdorfer and Woltersdorfer tram
    if (name === "srs" || name.includes("schöneicher") ||
        name.includes("schoeneicher") ||
        name.includes("woltersdorfer straßenbahn") ||
        name.includes("woltersdorfer strassenbahn")) {
        return { color: "#247f54", logo: "srs-tram.de" };
    }

    // Strausberger Eisenbahn: tram and ferry
    if (name.includes("strausberger eisenbahn")) {
        return { color: "#2e8b75", logo: "strausberger-eisenbahn.de" };
    }

    // Havelbus
    if (name.includes("havelbus") ||
        name.includes("havelbus verkehrsgesellschaft")) {
        return { color: "#c73345", logo: "havelbus.de" };
    }

    // Barnimer Busgesellschaft
    if (name.includes("barnimer busgesellschaft") || name === "bbg") {
        return { color: "#e69b25", logo: "bbg-eberswalde.de" };
    }

    // Busverkehr Oder-Spree
    if (name.includes("busverkehr oder-spree") ||
        name.includes("busverkehr oder spree") || name === "bos") {
        return { color: "#d04439", logo: "bos-fw.de" };
    }

    // regiobus Potsdam Mittelmark
    if (name.includes("regiobus potsdam") ||
        name.includes("regiobus mittelmark")) {
        return { color: "#75a943", logo: "regiobus-pm.de" };
    }

    // Oberhavel Verkehrsgesellschaft
    if (name.includes("oberhavel verkehrsgesellschaft") ||
        name === "ovg") {
        return { color: "#377fae", logo: "ovg-online.de" };
    }

    // Verkehrsgesellschaft Teltow-Fläming
    if (name.includes("verkehrsgesellschaft teltow") ||
        name === "vtf") {
        return { color: "#539b4b", logo: "vtf-online.de" };
    }

    // Regionale Verkehrsgesellschaft Dahme-Spreewald
    if (name.includes("verkehrsgesellschaft dahme") ||
        name === "rvs") {
        return { color: "#3c9b9d", logo: "rvs-lds.de" };
    }

    // mobus Märkisch-Oderland
    if (name.includes("mobus") ||
        name.includes("märkisch-oderland bus")) {
        return { color: "#488d4b", logo: "mo-bus.de" };
    }

    // Stadtverkehr Frankfurt (Oder)
    if (name.includes("stadtverkehrsgesellschaft frankfurt") ||
        name === "svf") {
        return { color: "#df343c", logo: "svf-ffo.de" };
    }

    // Uckermärkische Verkehrsgesellschaft
    if (name.includes("uckermärkische verkehrsgesellschaft") ||
        name === "uvg") {
        return { color: "#4093aa", logo: "uvg-online.de" };
    }

    // Verkehrsbetriebe Brandenburg an der Havel
    if (name.includes("verkehrsbetriebe brandenburg") ||
        name === "vbbr") {
        return { color: "#dd403c", logo: "vbbr.de" };
    }

    // Cottbusverkehr: tram and bus
    if (name.includes("cottbusverkehr")) {
        return { color: "#de383d", logo: "cottbusverkehr.de" };
    }


    // ==========================================
    // DRESDEN & VVO REGION
    // ==========================================

    // Dresdner Verkehrsbetriebe: tram, bus,
    // ferry, funicular and suspension railway
    if (name.includes("dresdner verkehrsbetriebe") ||
        name === "dvb" || name.startsWith("dvb ")) {
        return { color: "#efbb00", logo: "dvb.de" };
    }

    // S-Bahn Dresden (DB Regio Südost)
    if (name.includes("s-bahn dresden") ||
        ((name.includes("db regio südost") ||
          name.includes("db regio suedost")) &&
         /^s\s?[123]\b/.test(train))) {
        return { color: "#15965b", logo: "bahn.de" };
    }

    // RVSOE: buses and Kirnitzschtalbahn
    if (name.includes("rvsoe") ||
        name.includes("regionalverkehr sächsische schweiz") ||
        name.includes("regionalverkehr saechsische schweiz") ||
        name.includes("kirnitzschtalbahn")) {
        return { color: "#deab20", logo: "rvsoe.de" };
    }

    // Verkehrsgesellschaft Meißen
    if (name.includes("verkehrsgesellschaft meißen") ||
        name.includes("verkehrsgesellschaft meissen") ||
        name === "vgm") {
        return { color: "#427eaa", logo: "vg-meissen.de" };
    }

    // Regionalbus Oberlausitz
    if (name.includes("regionalbus oberlausitz") || name === "rbo") {
        return { color: "#33968b", logo: "regionalbus-oberlausitz.de" };
    }

    // Verkehrsgesellschaft Hoyerswerda
    if (name.includes("verkehrsgesellschaft hoyerswerda") ||
        name === "vgh") {
        return { color: "#198baf", logo: "vgh-hy.de" };
    }

    // Müller Busreisen
    if (name.includes("müller busreisen") ||
        name.includes("mueller busreisen") ||
        name === "mbr") {
        return { color: "#477cba", logo: "mueller-bus.de" };
    }

    // Satra Eberhardt
    if (name.includes("satra eberhardt") || name === "satra") {
        return { color: "#b85a36", logo: "satra-eberhardt.de" };
    }

    // Sächsische Dampfeisenbahngesellschaft:
    // Lößnitzgrundbahn and Weißeritztalbahn
    if (name.includes("dampfeisenbahngesellschaft") ||
        name.includes("lößnitzgrundbahn") ||
        name.includes("loessnitzgrundbahn") ||
        name.includes("weißeritztalbahn") ||
        name.includes("weisseritztalbahn") ||
        name === "sdg") {
        return { color: "#8a4b35", logo: "sdg-bahn.de" };
    }


    // ==========================================
    // VIENNA & SURROUNDING REGION
    // ==========================================

    // Wiener Lokalbahnen Verkehrsdienste
    if (name.includes("wiener lokalbahnen verkehrsdienste") ||
        name === "wlv") {
        return { color: "#478a9d", logo: "wlb.at" };
    }

    // Badner Bahn / Wiener Lokalbahnen
    if (name.includes("wiener lokalbahnen") ||
        name.includes("badner bahn") ||
        name === "wlb") {
        return { color: "#2565a7", logo: "wlb.at" };
    }

    // Dr. Richard buses
    if (name.includes("dr. richard") ||
        name.includes("dr richard") ||
        name.includes("richard verkehrsbetrieb") ||
        name.includes("richard niederösterreich")) {
        return { color: "#d93942", logo: "richard.at" };
    }

    // Gschwindl buses
    if (name.includes("gschwindl")) {
        return { color: "#e7a02c", logo: "gschwindl.at" };
    }

    // Blaguss buses
    if (name.includes("blaguss")) {
        return { color: "#d32d39", logo: "blaguss.com" };
    }

    // ZuklinBus
    if (name.includes("zuklin")) {
        return { color: "#4a8bb1", logo: "zuklinbus.at" };
    }

    // Vienna Airport Lines
    if (name.includes("vienna airport lines")) {
        return { color: "#2674a6", logo: "viennaairportlines.at" };
    }

    // City Airport Train (including replacement buses)
    if (name.includes("city airport train") ||
        name === "cat" || name.startsWith("cat airport")) {
        return { color: "#80bb35", logo: "cityairporttrain.com" };
    }

    // NÖVOG regional rail and bus
    if (name.includes("növog") ||
        name.includes("noevog") ||
        name.includes("niederösterreichische verkehrsorganisation")) {
        return { color: "#e1a22b", logo: "noevog.at" };
    }

    // Wiener Linien: U-Bahn, tram, bus
    if (name.includes("wiener linien")) {
        const u = train.match(/^u\s*([12346])\b/);

        const uColors = {
            1: "#e32636",
            2: "#994a9e",
            3: "#ef8100",
            4: "#009b66",
            6: "#8d6246"
        };

        if (u) {
            return { color: uColors[u[1]], logo: "wienerlinien.at" };
        }

        return { color: "#df3449", logo: "wienerlinien.at" };
    }

    // Wiener Neustädter Stadtwerke
    if (name.includes("wiener neustädter stadtwerke") ||
        name.includes("wiener neustaedter stadtwerke")) {
        return { color: "#437da7", logo: "wnsks.at" };
    }


    // ==========================================
    // MÜRZZUSCHLAG & MÜRZTAL / STYRIA
    // ==========================================

    // ÖBB Postbus: Austrian regional bus services
    if (name.includes("postbus") ||
        name.includes("österreichische postbus") ||
        name.includes("oesterreichische postbus")) {
        return { color: "#dc353a", logo: "postbus.at" };
    }

    // MVG: Mürztaler Verkehrsgesellschaft
    // Avoid matching "MVG" alone (also means Munich MVG)
    if (name.includes("mürztaler verkehr") ||
        name.includes("muerztaler verkehr") ||
        name.includes("mvg kapfenberg")) {
        return { color: "#267eaf", logo: "mvg-kapfenberg.com" };
    }

    // Gruber regional bus services
    if (name.includes("verkehrsbetriebe gruber") ||
        name.includes("gruber-reisen") ||
        name === "gruber") {
        return { color: "#528c4f", logo: "gruberreisen.at" };
    }

    // Steiermarkbahn
    if (name.includes("steiermarkbahn") ||
        name.includes("steiermärkische landesbahnen")) {
        return { color: "#3e8a60", logo: "stlb.at" };
    }

    // S-Bahn Wien / S-Bahn Steiermark (ÖBB)
    if (name.includes("s-bahn wien") ||
        name.includes("s-bahn steiermark") ||
        ((name.includes("öbb") ||
          name.includes("oebb") ||
          name.includes("österreichische bundesbahnen")) &&
         /^s\s?\d+\b/.test(train))) {
        return { color: "#259b77", logo: "oebb.at" };
    }

    // RegioBus Steiermark as a fallback brand
    if (name.includes("regiobus steiermark") ||
        name.includes("verbund linie steiermark")) {
        return { color: "#66a641", logo: "verbundlinie.at" };
    }

    // FlixBus (before the existing general Flix rule)
    if (name.includes("flixbus")) {
        return { color: "#169b35", logo: "flixbus.de" };
    }
    
    // GERMAN REGIONAL AND LONG-DISTANCE OPERATORS

    const laenderbahn =
        name.includes("länderbahn") ||
        name.includes("laenderbahn") ||
        name.includes("regentalbahn");

    // trilex - Saxony / Czech Republic
    if (name.includes("trilex") || /^tlx?\b/.test(train) ||
        (laenderbahn && /^(re ?[12]|rb ?6[01])\b/.test(train))) {
        return { color: "#f1a312", logo: "trilex.de" };
    }

    // alex - Bavaria / Czech Republic
    if (name.includes("alex") || /^alx\b/.test(train) ||
        (laenderbahn && /^re ?(?:23|25)\b/.test(train))) {
        return { color: "#2486bb", logo: "alex.info" };
    }

    // vogtlandbahn
    if (name.includes("vogtlandbahn") ||
        (laenderbahn && /^rb ?[1245]\b/.test(train))) {
        return { color: "#007f61", logo: "vogtlandbahn.de" };
    }

    // oberpfalzbahn
    if (name.includes("oberpfalzbahn") ||
        (laenderbahn && /^rb ?(?:23|27|28|29)\b/.test(train))) {
        return { color: "#eea900", logo: "oberpfalzbahn.de" };
    }

    // waldbahn
    if (name.includes("waldbahn") ||
        (laenderbahn && /^rb ?(?:35|36|37|38)\b/.test(train))) {
        return { color: "#438f45", logo: "waldbahn.de" };
    }

    // MRB - Mitteldeutsche Regiobahn
    if (name.includes("mitteldeutsche regiobahn") ||
        name.includes("transdev regio ost") || name === "mrb") {
        return { color: "#b02a55", logo: "mitteldeutsche-regiobahn.de" };
    }

    // BRB - Bayerische Regiobahn
    if (name.includes("bayerische regiobahn") ||
        name.includes("transdev bayern") || name === "brb" ||
        name.startsWith("brb ")) {
        return { color: "#1766a3", logo: "brb.de" };
    }

    // MittelrheinBahn / Trans Regio
    if (name.includes("mittelrheinbahn") ||
        name.includes("mittelrhein-bahn") ||
        name.includes("trans regio")) {
        return { color: "#438bce", logo: "mittelrheinbahn.de" };
    }

    // ODEG - Ostdeutsche Eisenbahn
    if (name.includes("odeg") ||
        name.includes("ostdeutsche eisenbahn")) {
        return { color: "#ebaa23", logo: "odeg.de" };
    }

    // NEB - Niederbarnimer Eisenbahn
    if (name === "neb" || name.startsWith("neb ") ||
        name.includes("niederbarnimer eisenbahn")) {
        return { color: "#e5a800", logo: "neb.de" };
    }

    // erixx
    if (name.includes("erixx")) {
        return { color: "#7aad42", logo: "erixx.de" };
    }

    // enno
    if (name.includes("enno") ||
        (name.includes("metronom") && /^re ?(?:30|50)\b/.test(train))) {
        return { color: "#d74732", logo: "der-enno.de" };
    }

    // metronom
    if (name.includes("metronom")) {
        return { color: "#f2c22d", logo: "der-metronom.de" };
    }

    // NordWestBahn
    if (name.includes("nordwestbahn")) {
        return { color: "#127eb1", logo: "nordwestbahn.de" };
    }

    // WestfalenBahn
    if (name.includes("westfalenbahn")) {
        return { color: "#30a1bd", logo: "westfalenbahn.de" };
    }

    // eurobahn
    if (name.includes("eurobahn")) {
        return { color: "#e6a400", logo: "eurobahn.de" };
    }

    // National Express
    if (name.includes("national express")) {
        return { color: "#d52239", logo: "nationalexpress.de" };
    }

    // VIAS
    if (name === "vias" || name.startsWith("vias ") ||
        name.includes("vias rail")) {
        return { color: "#a4317b", logo: "vias-online.de" };
    }

    // vlexx
    if (name.includes("vlexx")) {
        return { color: "#1386b8", logo: "vlexx.de" };
    }

    // HLB - Hessische Landesbahn
    if (name === "hlb" || name.startsWith("hlb ") ||
        name.includes("hessische landesbahn") ||
        name.includes("hlb hessenbahn")) {
        return { color: "#e6a700", logo: "hlb-online.de" };
    }

    // agilis
    if (name.includes("agilis")) {
        return { color: "#007f94", logo: "agilis.de" };
    }

    // cantus
    if (name.includes("cantus")) {
        return { color: "#aabf38", logo: "cantus-bahn.de" };
    }

    // SWEG
    if (name.includes("sweg") ||
        name.includes("südwestdeutsche landesverkehr")) {
        return { color: "#e66e28", logo: "sweg.de" };
    }

    // AKN Eisenbahn
    if (name === "akn" || name.startsWith("akn ") ||
        name.includes("akn eisenbahn")) {
        return { color: "#d42b31", logo: "akn.de" };
    }

    // nordbahn
    if (name.includes("nordbahn")) {
        return { color: "#2e98b9", logo: "nordbahn.de" };
    }

    // Arverio / former Go-Ahead Deutschland
    if (name.includes("arverio") || name.includes("go-ahead")) {
        return { color: "#276ca5", logo: "arverio.de" };
    }

    // Erfurter Bahn
    if (name.includes("erfurter bahn")) {
        return { color: "#c92c37", logo: "erfurter-bahn.de" };
    }

    // Süd-Thüringen-Bahn
    if (name.includes("süd-thüringen-bahn") ||
        name.includes("sued-thueringen-bahn")) {
        return { color: "#dc3e36", logo: "sued-thueringen-bahn.de" };
    }

    // City-Bahn Chemnitz
    if (name.includes("city-bahn chemnitz")) {
        return { color: "#cf2934", logo: "city-bahn.de" };
    }

    // Erzgebirgsbahn
    if (name.includes("erzgebirgsbahn")) {
        return { color: "#a72c38", logo: "erzgebirgsbahn.de" };
    }

    // Regionalverkehre start Deutschland
    if (name.includes("regionalverkehre start") ||
        name.startsWith("start deutschland") ||
        name.startsWith("start ")) {
        return { color: "#a5bc31", logo: "startgmbh.com" };
    }

    // S-Bahn Berlin
    if (name.includes("s-bahn berlin")) {
        return { color: "#008d58", logo: "sbahn.berlin" };
    }

    // S-Bahn Hamburg
    if (name.includes("s-bahn hamburg")) {
        return { color: "#008c63", logo: "s-bahn-hamburg.de" };
    }

    // Rurtalbahn
    if (name.includes("rurtalbahn")) {
        return { color: "#e4aa25", logo: "rurtalbahn.de" };
    }

    // Regiobahn (Rhine-Ruhr region)
    if (name.includes("regiobahn fahrbetrieb")) {
        return { color: "#4385b5", logo: "regio-bahn.de" };
    }

    // Die Länderbahn (general fallback for its brands)
    if (laenderbahn) {
        return { color: "#508c77", logo: "laenderbahn.com" };
    }

    // EUROPEAN RAIL OPERATORS

    // Eurostar
    if (name.includes("eurostar")) {
        return { color: "#242d62", logo: "eurostar.com" };
    }

    // Switzerland: SBB
    if (name.includes("sbb") || name.includes("cff") || name.includes("ffs")) {
        return { color: "#eb0000", logo: "sbb.ch" };
    }

    // Switzerland: BLS
    if (name === "bls" || name.startsWith("bls ")) {
        return { color: "#008c95", logo: "bls.ch" };
    }

    // Switzerland: SOB
    if (name === "sob" || name.includes("südostbahn")) {
        return { color: "#006c9c", logo: "sob.ch" };
    }

    // United Kingdom: Avanti West Coast
    if (name.includes("avanti") || name.includes("first trenitalia west coast")) {
        return { color: "#f05a42", logo: "avantiwestcoast.co.uk" };
    }

    // Italy: Trenitalia
    if (name.includes("trenitalia")) {
        return { color: "#c8102e", logo: "trenitalia.com" };
    }

    // Italy: Italo
    if (name.includes("italo") || name.includes("nuovo trasporto viaggiatori")) {
        return { color: "#be0027", logo: "italotreno.com" };
    }

    // Spain: Renfe
    if (name.includes("renfe")) {
        return { color: "#830051", logo: "renfe.com" };
    }

    // Spain: iryo
    if (name.includes("iryo")) {
        return { color: "#e52a37", logo: "iryo.eu" };
    }

    // Belgium: SNCB / NMBS
    if (name.includes("sncb") || name.includes("nmbs")) {
        return { color: "#00549f", logo: "belgiantrain.be" };
    }

    // Netherlands: NS
    if (name === "ns" || name.startsWith("ns ") ||
        name.includes("nederlandse spoorwegen")) {
        return { color: "#003082", logo: "ns.nl" };
    }

    // Luxembourg: CFL
    if (name === "cfl" || name.startsWith("cfl ") ||
        name.includes("chemins de fer luxembourgeois")) {
        return { color: "#d71920", logo: "cfl.lu" };
    }

    // Denmark: DSB
    if (name === "dsb" || name.startsWith("dsb ") ||
        name.includes("danske statsbaner")) {
        return { color: "#d91e25", logo: "dsb.dk" };
    }

    // Sweden: SJ
    if (name === "sj" || name.startsWith("sj ")) {
        return { color: "#383838", logo: "sj.se" };
    }

    // Norway: Vy
    if (name === "vy" || name.startsWith("vy ") ||
        name.includes("vygruppen")) {
        return { color: "#006b56", logo: "vy.no" };
    }

    // Finland: VR
    if (name === "vr" || name.startsWith("vr ") ||
        name.startsWith("vr-")) {
        return { color: "#009c5a", logo: "vr.fi" };
    }

    // Poland: PKP Intercity
    if (name.includes("pkp intercity") || name.includes("pkp ic")) {
        return { color: "#193d75", logo: "intercity.pl" };
    }

    // Poland: Polregio
    if (name.includes("polregio")) {
        return { color: "#c81959", logo: "polregio.pl" };
    }

    // Czech Republic: Leo Express
    if (name.includes("leo express")) {
        return { color: "#292929", logo: "leoexpress.com" };
    }

    // Slovakia: ZSSK
    if (name.includes("zssk") ||
        name.includes("železničná spoločnosť slovensko")) {
        return { color: "#e52b35", logo: "zssk.sk" };
    }

    // Hungary: MAV
    if (name.includes("máv") || name.includes("mav-start") ||
        name.includes("mav-csoport")) {
        return { color: "#005baa", logo: "mavcsoport.hu" };
    }

    // Hungary / Austria: GYSEV / Raaberbahn
    if (name.includes("gysev") || name.includes("raaberbahn")) {
        return { color: "#64a330", logo: "gysev.hu" };
    }

    // Portugal: CP
    if (name === "cp" || name.startsWith("cp ") ||
        name.includes("comboios de portugal")) {
        return { color: "#d71920", logo: "cp.pt" };
    }

    // Romania: CFR Calatori
    if (name.includes("cfr călători") || name.includes("cfr calatori")) {
        return { color: "#16599a", logo: "cfrcalatori.ro" };
    }

    // Croatia: HZPP
    if (name.includes("hžpp") || name.includes("hzpp") ||
        name.includes("hž putnički") || name.includes("hrvatske željeznice")) {
        return { color: "#1255a2", logo: "hzpp.hr" };
    }

    // Slovenia: SZ
    if (name.includes("slovenske železnice") ||
        name.includes("sž potniški")) {
        return { color: "#00509d", logo: "sz.si" };
    }

    // Greece: Hellenic Train
    if (name.includes("hellenic train")) {
        return { color: "#008b9d", logo: "hellenictrain.gr" };
    }

    // United Kingdom: LNER
    if (name.includes("lner") ||
        name.includes("london north eastern railway")) {
        return { color: "#c82c38", logo: "lner.co.uk" };
    }

    // United Kingdom: GWR
    if (name === "gwr" || name.includes("great western railway") ||
        name.includes("first greater western")) {
        return { color: "#006450", logo: "gwr.com" };
    }

    // United Kingdom: ScotRail
    if (name.includes("scotrail")) {
        return { color: "#164e83", logo: "scotrail.co.uk" };
    }

    // United Kingdom: TransPennine Express
    if (name.includes("transpennine")) {
        return { color: "#243f82", logo: "tpexpress.co.uk" };
    }

    // United Kingdom: CrossCountry
    if (name.includes("crosscountry")) {
        return { color: "#862452", logo: "crosscountrytrains.co.uk" };
    }

    // END AI

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
        const color =
            /^ice\b/.test(train) ? "#f03345" :
            /^ic\b/.test(train) ? "#bd0012" :
            "#ec0016";
        return { color, logo: "bahn.de" };
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

        const header = document.createElement("div");
        header.className = "connection-header";

        const tookButton = document.createElement("button");
        tookButton.type = "button";
        tookButton.className = "took-button";

        // how crazy are ya :)

        const trains = journey.legs.filter(leg => leg.mode !== "WALK").length;
        const transfers = Math.max(0, trains - 1);

        tookButton.textContent =
            transfers > 4 ? "I took this horde of wolves! :3c" :
            transfers > 0 ? "I took these wolves!" :
            "I took this wolf!";

        tookButton.addEventListener("click", async () => {
            const connection = {
                legs: journey.legs
                    .filter(leg => leg.mode !== "WALK" && leg.legGeometry?.points)
                    .map(leg => ({
                        points: leg.legGeometry.points,
                        precision: leg.legGeometry.precision || 6,
                        color: getCarrier(leg).color,
                        train: leg.displayName || leg.mode,
                        carrier: leg.agencyName || "Unknown carrier",
                        startTime: leg.startTime,
                        endTime: leg.endTime
                    }))
            };

            if (!connection.legs.length) {
                alert("No route geometry available!");
                return;
            }

            tookButton.disabled = true;

            try {
                await updateSavedRoutes([...savedRoutes, connection]);

                const lines = drawConnection(connection);

                map.fitBounds(L.featureGroup(lines).getBounds(), {
                    padding: [30, 30]
                });
            } catch (error) {
                alert(error.message);
            } finally {
                tookButton.disabled = false;
            }
        });

        header.appendChild(title);
        header.appendChild(tookButton);
        card.appendChild(header);

        const info = document.createElement("p");
        const minutes = Math.round(journey.duration / 60);

        info.textContent =
            `${Math.floor(minutes / 60)} h ${minutes % 60} min · ` +
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