import { describe, expect, it } from "vitest";
import { attendanceMessage, whatsappShare } from "@/lib/attendance/whatsapp";

describe("asistencia por WhatsApp", () => {
	it("arma el mensaje con el total (Zoom solo si hubo)", () => {
		expect(attendanceMessage("Entre semana", "jueves 19 de noviembre de 2026", 85, 12)).toBe(
			"*Asistencia · Entre semana*\n_jueves 19 de noviembre de 2026_\n\n🏛️ En el salón: 85\n💻 Por Zoom: 12\n*Total: 97*",
		);
		expect(attendanceMessage("Fin de semana", "domingo", 90, 0)).not.toContain("Zoom");
		expect(whatsappShare("a b")).toBe("https://wa.me/?text=a%20b");
	});
});
