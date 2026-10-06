self.addEventListener("push", (event) => {
	let data = { title: "MiCongre", body: "" };
	try {
		if (event.data) data = event.data.json();
	} catch {
		data = { title: "MiCongre", body: event.data ? event.data.text() : "" };
	}

	event.waitUntil(
		self.registration.showNotification(data.title || "MiCongre", {
			body: data.body || "",
			data: { url: data.url || "/panel" },
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/panel";

	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
			for (const client of clientList) {
				if (client.url.includes(url) && "focus" in client) return client.focus();
			}
			if (self.clients.openWindow) return self.clients.openWindow(url);
		}),
	);
});
