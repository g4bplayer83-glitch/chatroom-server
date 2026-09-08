/* Salons vocaux P2P. Aucune capture avant une action explicite. */
(() => {
  "use strict";
  const { socket, state, toast, preferences } = window.DocSpace;
  const $ = (id) => document.getElementById(id);
  let stream = null,
    room = "",
    muted = false,
    deafened = false,
    joining = false,
    generation = 0,
    config = { iceServers: [] },
    testStream = null,
    testContext = null,
    testFrame = 0;
  const peers = new Map(),
    pendingICE = new Map();
  function constraints() {
    return {
      audio: {
        deviceId: preferences.microphone
          ? { exact: preferences.microphone }
          : undefined,
        echoCancellation: preferences.echo !== false,
        noiseSuppression: preferences.noise !== false,
        autoGainControl: true,
      },
      video: false,
    };
  }
  function captureError(error) {
    return error.name === "NotAllowedError"
      ? "Le micro n’est pas autorisé. Vérifie les permissions du navigateur."
      : error.name === "NotFoundError"
        ? "Aucun microphone détecté."
        : error.name === "NotReadableError"
          ? "Ton microphone est déjà utilisé ou indisponible."
          : error.message || "Impossible de démarrer le micro.";
  }
  function closePeer(id) {
    const peer = peers.get(id);
    if (peer) {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.onconnectionstatechange = null;
      peer.close();
      peers.delete(id);
    }
    pendingICE.delete(id);
    document.getElementById(`audio-${id}`)?.remove();
  }
  function leave(notify = true) {
    generation++;
    joining = false;
    if (notify && room && socket.connected) socket.emit("voice_leave");
    room = "";
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    for (const id of [...peers.keys()]) closePeer(id);
    pendingICE.clear();
    $("voice-panel").hidden = true;
    $("remote-audio").replaceChildren();
  }
  async function createPeer(id) {
    if (peers.has(id)) return peers.get(id);
    const peer = new RTCPeerConnection({
      iceServers: config.iceServers || [],
      iceTransportPolicy: config.forceRelay ? "relay" : "all",
    });
    peers.set(id, peer);
    stream?.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.onicecandidate = (e) => {
      if (e.candidate)
        socket.emit("voice_ice_candidate", {
          targetId: id,
          candidate: e.candidate,
        });
    };
    peer.ontrack = (e) => {
      let audio = $(`audio-${id}`);
      if (!audio) {
        audio = document.createElement("audio");
        audio.id = `audio-${id}`;
        audio.autoplay = true;
        audio.playsInline = true;
        $("remote-audio").append(audio);
      }
      audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      audio.muted = deafened;
      audio.play().catch(() => {
        toast("Appuie sur le casque pour activer le son du vocal.");
      });
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") {
        toast(
          "Connexion vocale impossible avec un participant. Le serveur peut nécessiter TURN.",
        );
        closePeer(id);
      }
    };
    return peer;
  }
  async function flushICE(id, peer) {
    for (const candidate of pendingICE.get(id) || [])
      try {
        await peer.addIceCandidate(candidate);
      } catch {}
    pendingICE.delete(id);
  }
  async function join(target) {
    if (!state.ready) return toast("Connecte-toi avant de rejoindre le vocal.");
    if (joining) return;
    if (room === target) return;
    leave();
    joining = true;
    const ticket = generation;
    try {
      const response = await fetch("/api/voice/runtime-config");
      if (!response.ok) throw Error("Configuration vocale indisponible.");
      config = await response.json();
      if (config.sfuEnabled)
        throw Error(
          "Cette interface utilise les salons P2P. Configure DOCSPACE_VOICE_MODE=p2p sur le serveur.",
        );
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Le microphone demande une connexion HTTPS.");
      const captured = await navigator.mediaDevices.getUserMedia(constraints());
      if (ticket !== generation) {
        captured.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = captured;
      muted = false;
      deafened = false;
      room = target;
      socket.emit("voice_join", { room });
      $("voice-panel").hidden = false;
      $("voice-status").textContent = target;
      updateButtons();
      await listDevices();
    } catch (e) {
      leave();
      toast(captureError(e));
    } finally {
      joining = false;
    }
  }
  function updateButtons() {
    $("mic-toggle").classList.toggle("danger", muted);
    $("mic-toggle").setAttribute(
      "aria-label",
      muted ? "Activer le micro" : "Couper le micro",
    );
    $("audio-toggle").classList.toggle("danger", deafened);
    $("audio-toggle").setAttribute(
      "aria-label",
      deafened ? "Activer le son" : "Couper le son",
    );
    socket.emit("voice_status_update", { muted, deafened });
  }
  socket.on("voice_joined", async (d) => {
    if (!stream || d.room !== room) return;
    const ticket = generation;
    for (const p of d.participants || []) {
      try {
        const peer = await createPeer(p.socketId);
        if (ticket !== generation) return;
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit("voice_offer", {
          targetId: p.socketId,
          offer: peer.localDescription,
        });
      } catch (e) {
        toast("Un participant n’a pas pu être connecté.");
      }
    }
  });
  socket.on("voice_offer", async (d) => {
    if (!stream || !room) return;
    try {
      const peer = await createPeer(d.fromId);
      await peer.setRemoteDescription(d.offer);
      await flushICE(d.fromId, peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("voice_answer", {
        targetId: d.fromId,
        answer: peer.localDescription,
      });
    } catch {
      closePeer(d.fromId);
      toast("Impossible de répondre à la connexion vocale.");
    }
  });
  socket.on("voice_answer", async (d) => {
    const peer = peers.get(d.fromId);
    if (!peer) return;
    try {
      await peer.setRemoteDescription(d.answer);
      await flushICE(d.fromId, peer);
    } catch {
      closePeer(d.fromId);
    }
  });
  socket.on("voice_ice_candidate", async (d) => {
    if (!room) return;
    const peer = peers.get(d.fromId);
    if (peer?.remoteDescription) {
      try {
        await peer.addIceCandidate(d.candidate);
      } catch {}
    } else {
      const queued = pendingICE.get(d.fromId) || [];
      if (queued.length < 100) queued.push(d.candidate);
      pendingICE.set(d.fromId, queued);
    }
  });
  socket.on("voice_peer_left", (d) => closePeer(d.socketId));
  socket.on("voice_participants_update", (d) => {
    document.querySelectorAll("[data-voice-count]").forEach((el) => {
      if (el.dataset.voiceCount === d.room)
        el.textContent = String(d.participants?.length || 0);
    });
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.voiceRoom) join(b.dataset.voiceRoom);
    if (b.id === "voice-leave") leave();
    if (b.id === "mic-toggle" && stream) {
      muted = !muted;
      stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
      updateButtons();
    }
    if (b.id === "audio-toggle") {
      deafened = !deafened;
      document.querySelectorAll("#remote-audio audio").forEach((a) => {
        a.muted = deafened;
        if (!deafened) a.play().catch(() => {});
      });
      updateButtons();
    }
    if (b.id === "refresh-devices") listDevices();
    if (b.id === "test-mic") toggleTest();
  });
  async function listDevices() {
    const select = $("mic-device");
    if (!select || !navigator.mediaDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      select.replaceChildren(new Option("Microphone par défaut", ""));
      devices
        .filter((d) => d.kind === "audioinput" && d.deviceId)
        .forEach((d, i) =>
          select.add(new Option(d.label || `Microphone ${i + 1}`, d.deviceId)),
        );
      select.value = preferences.microphone || "";
      select.onchange = () => {
        preferences.microphone = select.value;
        localStorage.setItem(
          "docspace.preferences",
          JSON.stringify(preferences),
        );
      };
    } catch {
      toast("Impossible de lister les microphones.");
    }
  }
  function stopTest() {
    generationTest++;
    cancelAnimationFrame(testFrame);
    testStream?.getTracks().forEach((t) => t.stop());
    testStream = null;
    testContext?.close();
    testContext = null;
    if ($("test-mic")) $("test-mic").textContent = "Tester mon micro";
    if ($("mic-level")) $("mic-level").value = 0;
  }
  let generationTest = 0;
  async function toggleTest() {
    if (testStream) {
      stopTest();
      return;
    }
    const ticket = ++generationTest;
    try {
      const capture = await navigator.mediaDevices.getUserMedia(constraints());
      if (
        ticket !== generationTest ||
        !$("settings-dialog").open ||
        !$("mic-level")
      ) {
        capture.getTracks().forEach((t) => t.stop());
        return;
      }
      testStream = capture;
      testContext = new AudioContext();
      const source = testContext.createMediaStreamSource(testStream),
        analyser = testContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      $("test-mic").textContent = "Arrêter le test";
      const tick = () => {
        if (!$("mic-level") || !$("settings-dialog").open) return stopTest();
        analyser.getByteTimeDomainData(data);
        const rms = Math.sqrt(
          data.reduce((sum, n) => sum + ((n - 128) / 128) ** 2, 0) /
            data.length,
        );
        $("mic-level").value = Math.min(100, rms * 400);
        testFrame = requestAnimationFrame(tick);
      };
      tick();
      await listDevices();
    } catch (e) {
      stopTest();
      toast(captureError(e));
    }
  }
  $("settings-dialog").addEventListener("close", stopTest);
  document.getElementById("settings-tabs").addEventListener("click", stopTest);
  window.addEventListener("pagehide", () => {
    leave();
    stopTest();
  });
  window.DocSpaceVoice = { join, leave, listDevices };
})();
