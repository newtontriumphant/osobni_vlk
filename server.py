from flask import Flask, request, jsonify, send_from_directory
import sqlite3
import json
import re
from pathlib import Path

app = Flask(__name__)
BASE = Path(__file__).resolve().parent
DB = BASE / "users.db"

with sqlite3.connect(DB) as con:
    con.execute("""
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            routes TEXT DEFAULT '[]'
        )
    """)

@app.get("/")
def home():
    return send_from_directory(BASE, "index.html")

@app.get("/<filename>")
def files(filename):
    if filename not in ("style.css", "script.js"):
        return "Not found", 404
    return send_from_directory(BASE, filename)

@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    name = str(data.get("username", "")).strip().lower()

    if not re.fullmatch(r"[a-z0-9_-]{1,30}", name):
        return jsonify(error="Ungültiger Benutzername"), 400

    with sqlite3.connect(DB) as con:
        con.execute(
            "INSERT OR IGNORE INTO users (username) VALUES (?)",
            (name,)
        )
        routes = con.execute(
            "SELECT routes FROM users WHERE username = ?",
            (name,)
        ).fetchone()[0]

    return jsonify(username=name, routes=json.loads(routes))

@app.post("/api/save")
def save():
    data = request.get_json(silent=True) or {}
    name = str(data.get("username", "")).strip().lower()
    routes = data.get("routes")

    if not re.fullmatch(r"[a-z0-9_-]{1,30}", name):
        return jsonify(error="Ungültiger Benutzername"), 400

    if not isinstance(routes, list) or len(routes) > 500:
        return jsonify(error="Ungültige Strecken"), 400

    with sqlite3.connect(DB) as con:
        result = con.execute(
            "UPDATE users SET routes = ? WHERE username = ?",
            (json.dumps(routes), name)
        )
        if result.rowcount == 0:
            return jsonify(error="Benutzer nicht gefunden"), 404

    return jsonify(success=True)

if __name__ == "__main__":
    app.run(port=8000, debug=True)