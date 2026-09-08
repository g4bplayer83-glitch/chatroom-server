const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { io } = require("socket.io-client");
const { JSDOM, VirtualConsole } = require("jsdom");
const root = path.resolve(__dirname, "..");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function event(socket, name, trigger, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(name, handler);
      reject(Error(`Timeout: ${name}`));
    }, 5000);
    function handler(data) {
      if (!predicate(data)) return;
      clearTimeout(timeout);
      socket.off(name, handler);
      resolve(data);
    }
    socket.on(name, handler);
    trigger?.();
  });
}
function ack(socket, name, payload) {
  return new Promise((resolve, reject) =>
    socket
      .timeout(5000)
      .emit(name, payload, (err, data) => (err ? reject(err) : resolve(data))),
  );
}
async function until(predicate, label) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await wait(30);
  }
  throw Error(`État manquant : ${label}`);
}

test(
  "Parcours réels : comptes, DM, fichiers, reconnexion, interface et jeux",
  { timeout: 90000 },
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "docspace-test-"));
    const log = fs.openSync(path.join(dir, "server.log"), "w");
    const port = 21000 + Math.floor(Math.random() * 10000),
      url = `http://127.0.0.1:${port}`;
    const server = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        DATA_DIR: path.join(dir, "data"),
        UPLOAD_DIR: path.join(dir, "uploads"),
        FIREBASE_CREDENTIALS: "",
        ADMIN_PASSWORD: "",
        DOCSPACE_PLUS_CODES: "TEST-CODE-ONLY",
      },
      stdio: ["ignore", log, log],
    });
    const clients = [],
      doms = [];
    t.after(async () => {
      for (const dom of doms) {
        dom.window.DocSpace?.socket.disconnect();
        dom.window.close();
      }
      for (const s of clients) s.disconnect();
      server.kill("SIGTERM");
      await wait(150);
      fs.closeSync(log);
      fs.rmSync(dir, { recursive: true, force: true });
    });
    for (let n = 0; n < 120; n++) {
      try {
        const r = await fetch(url + "/health-lite");
        if (r.ok) break;
      } catch {}
      await wait(50);
      if (n === 119)
        throw Error(fs.readFileSync(path.join(dir, "server.log"), "utf8"));
    }
    async function client() {
      const s = io(url, { transports: ["websocket"], forceNew: true });
      clients.push(s);
      await event(s, "connect");
      return s;
    }
    const alice = await client(),
      bob = await client();
    let aliceToken, bobToken;
    const anonymous = await client();
    let leakedMessages = 0;
    anonymous.on("new_message", () => leakedMessages++);
    await t.test(
      "Création, pseudo canonique et session sans mot de passe côté client",
      async () => {
        const a = await event(alice, "account_registered", () =>
          alice.emit("register_account", {
            username: "AliceTest",
            password: "mot-de-passe-A",
            email: "ignored@example.com",
          }),
        );
        aliceToken = a.token;
        assert.match(a.token, /^[a-f0-9]{64}$/);
        assert.equal(a.email, undefined);
        const b = await event(bob, "account_registered", () =>
          bob.emit("register_account", {
            username: "BobTest",
            password: "mot-de-passe-B",
          }),
        );
        bobToken = b.token;
        await event(alice, "user_join_ready", () =>
          alice.emit("user_join", {
            username: a.username,
            deviceId: "alice-test",
          }),
        );
        await event(bob, "user_join_ready", () =>
          bob.emit("user_join", { username: b.username, deviceId: "bob-test" }),
        );
        const saved = JSON.parse(
          fs.readFileSync(path.join(dir, "data/accounts.json"), "utf8"),
        );
        assert.equal(saved.alicetest.email, undefined);
        assert(!JSON.stringify(saved).includes(aliceToken));
        assert(!JSON.stringify(saved).includes("mot-de-passe-A"));
      },
    );
    let channelMessage;
    await t.test(
      "Salons : envoi confirmé, édition et suppression dans l’historique",
      async () => {
        const delivery = event(bob, "new_message");
        const result = await ack(alice, "send_message", {
          content: "Bonjour <équipe> !",
          channel: "général",
        });
        assert(result.success);
        channelMessage = await delivery;
        assert.equal(channelMessage.username, "AliceTest");
        await event(bob, "message_edited", () =>
          alice.emit("edit_message", {
            messageId: channelMessage.id,
            newContent: "Version corrigée",
          }),
        );
        let h = await event(bob, "channel_history", () =>
          bob.emit("switch_channel", { channel: "général" }),
        );
        assert.equal(
          h.messages.find((m) => m.id === channelMessage.id).content,
          "Version corrigée",
        );
        await event(bob, "message_deleted", () =>
          alice.emit("delete_message", { messageId: channelMessage.id }),
        );
        h = await event(bob, "channel_history", () =>
          bob.emit("switch_channel", { channel: "général" }),
        );
        assert(!h.messages.some((m) => m.id === channelMessage.id));
      },
    );
    await t.test(
      "DM : destinataire insensible à la casse, historique et refus utilisateur inexistant",
      async () => {
        const received = event(bob, "dm_received");
        const sent = await ack(alice, "send_dm", {
          to: "bOBtEST",
          content: "Salut en privé",
        });
        assert(sent.success);
        assert.equal((await received).id, sent.message.id);
        const history = await event(bob, "dm_history", () =>
          bob.emit("get_dm_history", { username: "alicetest" }),
        );
        assert.equal(history.messages.length, 1);
        assert.equal(history.messages[0].content, "Salut en privé");
        assert.equal(
          (await ack(alice, "send_dm", { to: "UnknownTest", content: "test" }))
            .success,
          false,
        );
      },
    );
    await t.test(
      "La bio survit à une nouvelle session, les emails ne permettent pas la connexion",
      async () => {
        await event(alice, "bio_updated", () =>
          alice.emit("update_bio", { bio: "Je crée des jeux." }),
        );
        const another = await client();
        const resumed = await event(another, "account_logged_in", () =>
          another.emit("resume_account", { token: aliceToken }),
        );
        assert.equal(resumed.username, "AliceTest");
        await event(another, "user_join_ready", () =>
          another.emit("user_join", {
            username: "AliceTest",
            deviceId: "another-device",
          }),
        );
        const profile = await event(another, "user_profile", () =>
          another.emit("get_user_profile", { username: "AliceTest" }),
        );
        assert.equal(profile.bio, "Je crée des jeux.");
        const outsider = await client();
        const denied = await event(outsider, "account_required", () =>
          outsider.emit("user_join", { username: "GuestUser" }),
        );
        assert(denied.message);
        const deniedEmail = await event(outsider, "account_error", () =>
          outsider.emit("login_account", {
            identifier: "ignored@example.com",
            password: "mot-de-passe-A",
          }),
        );
        assert(deniedEmail.message);
      },
    );
    await t.test(
      "Uploads authentifiés et fichiers internes inaccessibles",
      async () => {
        for (const privatePath of [
          "/server.js",
          "/data/accounts.json",
          "/package.json",
          "/godot/orbit-garden/project.godot",
        ])
          assert.equal((await fetch(url + privatePath)).status, 404);
        assert.equal(
          (await fetch(url + "/upload", { method: "POST" })).status,
          401,
        );
        const body = new FormData();
        body.append("file", new Blob(["Document de test"]), "projet.txt");
        const r = await fetch(url + "/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${aliceToken}` },
          body,
        });
        assert.equal(r.status, 200);
        const attachment = await r.json();
        assert.equal(
          await (await fetch(url + attachment.path)).text(),
          "Document de test",
        );
        assert(
          (
            await ack(alice, "send_dm", {
              to: "BobTest",
              content: "Notre document",
              attachment,
            })
          ).success,
        );
      },
    );
    await t.test("Code Plus à usage unique et emojis", async () => {
      const status = await event(alice, "plus_status", () =>
        alice.emit("redeem_plus_code", { code: "TEST-CODE-ONLY" }),
      );
      assert.equal(status.plusActive, true);
      const denied = await event(bob, "plus_error", () =>
        bob.emit("redeem_plus_code", { code: "TEST-CODE-ONLY" }),
      );
      assert.match(denied.message, /déjà/);
      const emojis = await event(alice, "custom_emojis_list", () =>
        alice.emit("create_custom_emoji", {
          name: "test_emoji",
          dataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        }),
      );
      assert(emojis.some((e) => e.name === "test_emoji"));
    });
    await t.test("Vocal : signalisation réservée au même salon", async () => {
      await event(alice, "voice_joined", () =>
        alice.emit("voice_join", { room: "Vocal Général" }),
      );
      const joined = await event(bob, "voice_joined", () =>
        bob.emit("voice_join", { room: "Vocal Général" }),
      );
      assert.equal(joined.participants[0].username, "AliceTest");
      const offer = await event(bob, "voice_offer", () =>
        alice.emit("voice_offer", {
          targetId: bob.id,
          offer: { type: "offer", sdp: "test-only" },
        }),
      );
      assert.equal(offer.fromId, alice.id);
      await event(alice, "voice_peer_left", () => bob.emit("voice_leave"));
      let leaked = false;
      bob.once("voice_offer", () => (leaked = true));
      alice.emit("voice_offer", {
        targetId: bob.id,
        offer: { type: "offer", sdp: "forbidden" },
      });
      await wait(100);
      assert.equal(leaked, false);
      alice.emit("voice_leave");
    });
    await t.test(
      "Serveur des jeux : duel Tetris et collecte du labyrinthe",
      async () => {
        await event(alice, "arcade_tetris_room", () =>
          alice.emit("arcade_tetris_join", { code: "TESTDUEL" }),
        );
        const start = event(alice, "arcade_tetris_start");
        bob.emit("arcade_tetris_join", { code: "TESTDUEL" });
        assert.equal((await start).code, "TESTDUEL");
        alice.emit("arcade_tetris_leave", { code: "TESTDUEL" });
        bob.emit("arcade_tetris_leave", { code: "TESTDUEL" });
        const snapshot = await event(alice, "arcade_maze_snapshot", () =>
          alice.emit("arcade_maze_join", { code: "TESTMAZE" }),
        );
        assert.equal(snapshot.orbs[0].y, 1.5);
        alice.emit("arcade_maze_move", {
          code: "TESTMAZE",
          x: 2.5,
          y: 1.5,
          a: 0,
        });
        const orb = await event(alice, "arcade_maze_orb", () =>
          alice.emit("arcade_maze_collect", { code: "TESTMAZE", orbId: "o0" }),
        );
        assert.equal(orb.score, 1);
        alice.emit("arcade_maze_leave", { code: "TESTMAZE" });
      },
    );
    async function makeUI(token, mobile = false) {
      const errors = [];
      let draws = 0;
      const vc = new VirtualConsole();
      vc.on("jsdomError", (e) => {
        if (!/Could not parse CSS|navigation|HTMLMediaElement/.test(e.message))
          errors.push(e.message);
      });
      const html = fs
        .readFileSync(path.join(root, "public/index.html"), "utf8")
        .replace(/<script[^>]*src=[^>]*><\/script>/g, "");
      const dom = new JSDOM(html, {
        url,
        runScripts: "outside-only",
        pretendToBeVisual: true,
        virtualConsole: vc,
      });
      doms.push(dom);
      const w = dom.window;
      w.io = (options) => io(url, options);
      w.fetch = (resource, options) => fetch(new URL(resource, url), options);
      w.matchMedia = () => ({
        matches: !mobile,
        addEventListener() {},
        removeEventListener() {},
      });
      w.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      w.HTMLDialogElement.prototype.close = function () {
        this.open = false;
        this.dispatchEvent(new w.Event("close"));
      };
      w.HTMLCanvasElement.prototype.getContext = () =>
        new Proxy(
          { canvas: { width: 960, height: 540 } },
          {
            get: (target, key) =>
              key in target
                ? target[key]
                : (...args) => {
                    draws++;
                  },
          },
        );
      w.sessionStorage.setItem("docspace.token", token);
      w.sessionStorage.setItem("docspace.device", "ui-" + Math.random());
      for (const file of ["app.js", "arcade.js", "voice.js"])
        w.eval(fs.readFileSync(path.join(root, "public", file), "utf8"));
      await until(() => w.DocSpace?.state.ready, "interface connectée");
      return { w, errors, draws: () => draws };
    }
    await t.test(
      "Interface connectée : DM, paramètres, navigation et commandes tactiles des jeux",
      async () => {
        const ui = await makeUI(aliceToken),
          w = ui.w,
          d = w.document;
        await until(() => w.DocSpace.state.channels.length > 0, "salons");
        assert(d.querySelector('[data-channel="général"]'));
        d.querySelector('[data-view="dms"]').click();
        d.getElementById("person-name").value = "BobTest";
        d.getElementById("person-form").dispatchEvent(
          new w.Event("submit", { bubbles: true, cancelable: true }),
        );
        await until(
          () =>
            w.DocSpace.state.messages.some(
              (m) => m.content === "Salut en privé",
            ),
          "historique DM",
        );
        d.getElementById("message-input").value =
          "Depuis la nouvelle interface";
        d.getElementById("composer").dispatchEvent(
          new w.Event("submit", { bubbles: true, cancelable: true }),
        );
        await until(
          () => d.getElementById("message-input").value === "",
          "confirmation envoi UI",
        );
        assert.equal(
          w.DocSpace.state.messages.filter(
            (m) => m.content === "Depuis la nouvelle interface",
          ).length,
          1,
        );
        d.querySelector("[data-settings]").click();
        for (const name of [
          "profile",
          "account",
          "appearance",
          "voice",
          "plus",
        ]) {
          d.querySelector(`[data-tab="${name}"]`).click();
          assert(d.getElementById("settings-content").textContent.trim());
        }
        assert(!d.querySelector("input[type=email]"));
        d.getElementById("settings-dialog").close();
        d.querySelector('[data-view="arcade"]').click();
        d.querySelector('[data-game-open="tetris"]').click();
        assert(d.getElementById("dsTetrisCanvas"));
        d.getElementById("dsTetrisSolo").click();
        const before = ui.draws();
        d.querySelector("#dsStageTetris .game-touch-controls button").click();
        await wait(40);
        assert(ui.draws() > before);
        assert.match(
          d.querySelector(
            ".ds-arcade-stage.active .ds-game-side .ds-game-status",
          ).textContent,
          /Solo/,
        );
        d.querySelector('[data-view="arcade"]').click();
        d.querySelector('[data-game-open="pong"]').click();
        assert(d.getElementById("dsPongCanvas"));
        d.querySelector('[data-view="arcade"]').click();
        d.querySelector('[data-game-open="maze"]').click();
        d.body.dispatchEvent(
          new w.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
        );
        await until(
          () => Number(d.getElementById("dsMazeScore").textContent) === 1,
          "collecte solo du premier orbe",
        );
        d.body.dispatchEvent(
          new w.KeyboardEvent("keyup", { key: "ArrowUp", bubbles: true }),
        );
        d.querySelector('[data-view="channels"]').click();
        assert(!d.body.classList.contains("ds-games-active"));
        assert.deepEqual(ui.errors, []);
        const mobile = await makeUI(bobToken, true);
        mobile.w.document.getElementById("menu-toggle").click();
        assert(
          mobile.w.document
            .getElementById("sidebar")
            .classList.contains("open"),
        );
        mobile.w.document.getElementById("drawer-shade").click();
        assert(
          !mobile.w.document
            .getElementById("sidebar")
            .classList.contains("open"),
        );
        assert.deepEqual(mobile.errors, []);
      },
    );
    await t.test(
      "Les diffusions et opérations administrateur exigent une session et un secret",
      async () => {
        assert.equal(leakedMessages, 0);
        assert.equal(
          (await fetch(url + "/admin/reset?key=docspace2024")).status,
          404,
        );
        assert.equal(
          (await fetch(url + "/admin/reset", { method: "POST" })).status,
          403,
        );
        const denial = await event(bob, "admin_response", () =>
          bob.emit("admin_action", { password: "", action: "clear_history" }),
        );
        assert.equal(denial.success, false);
      },
    );
    await t.test(
      "Changement du mot de passe : révocation des anciens jetons",
      async () => {
        const changed = await event(alice, "account_settings_saved", () =>
          alice.emit("change_account_password", {
            currentPassword: "mot-de-passe-A",
            newPassword: "nouveau-mot-de-passe-A",
          }),
        );
        assert(changed.token && changed.token !== aliceToken);
        const outsider = await client();
        await event(outsider, "session_expired", () =>
          outsider.emit("resume_account", { token: aliceToken }),
        );
        const login = await event(outsider, "account_logged_in", () =>
          outsider.emit("login_account", {
            username: "alicetest",
            password: "nouveau-mot-de-passe-A",
          }),
        );
        assert.equal(login.username, "AliceTest");
      },
    );
  },
);
