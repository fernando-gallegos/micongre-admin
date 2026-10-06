function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
	const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
	const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(base64);
	return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function isPushSupported(): boolean {
	return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
	if (!isPushSupported()) return null;
	const registration = await navigator.serviceWorker.getRegistration("/sw.js");
	if (!registration) return null;
	return registration.pushManager.getSubscription();
}

export async function subscribeToPush(): Promise<void> {
	if (!isPushSupported()) throw new Error("unsupported");

	const registration = await navigator.serviceWorker.register("/sw.js");
	const permission = await Notification.requestPermission();
	if (permission !== "granted") throw new Error("permission_denied");

	const keyResponse = await fetch("/api/push/vapid-public-key");
	if (!keyResponse.ok) throw new Error("no_vapid_key");
	const { publicKey } = (await keyResponse.json()) as { publicKey: string };

	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(publicKey),
	});

	const response = await fetch("/api/push/subscribe", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(subscription.toJSON()),
	});
	if (!response.ok) throw new Error("subscribe_failed");
}

export async function unsubscribeFromPush(): Promise<void> {
	const subscription = await getExistingSubscription();
	if (!subscription) return;

	const endpoint = subscription.endpoint;
	await subscription.unsubscribe();
	await fetch("/api/push/subscribe", {
		method: "DELETE",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ endpoint }),
	});
}
