import { describe, expect, it } from "vitest";
import { contactLinks, internationalDigits } from "@/lib/contact/phone";

describe("números de contacto", () => {
	it("un número local de 8 dígitos recibe el 505 de Nicaragua", () => {
		expect(internationalDigits("8888-9999")).toBe("50588889999");
		expect(internationalDigits("8888 9999")).toBe("50588889999");
	});
	it("respeta el código de país que ya trae", () => {
		expect(internationalDigits("+505 8888 9999")).toBe("50588889999");
		expect(internationalDigits("(505) 88889999")).toBe("50588889999");
		expect(internationalDigits("00505 8888 9999")).toBe("50588889999");
		expect(internationalDigits("+1 (305) 555-0100")).toBe("13055550100");
	});
	it("descarta lo que no parece un teléfono", () => {
		expect(internationalDigits(null)).toBeNull();
		expect(internationalDigits("")).toBeNull();
		expect(internationalDigits("no tiene")).toBeNull();
		expect(internationalDigits("12345")).toBeNull();
	});
	it("arma los enlaces de llamada, SMS y WhatsApp", () => {
		expect(contactLinks("8888-9999")).toEqual({
			display: "+505 8888 9999",
			tel: "tel:+50588889999",
			sms: "sms:+50588889999",
			whatsapp: "https://wa.me/50588889999",
		});
		expect(contactLinks("sin número")).toBeNull();
	});
});
