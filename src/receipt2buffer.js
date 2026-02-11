import { Receipt } from "./receipt.js";

export async function template2Buffer(template) {
  const receipt = Receipt.from(template, "-c 42 -p escpos -l auto");
  const command = await receipt.toCommand();
  // binary string -> Uint8Array
  const data = new Uint8Array(command.length);
  for (let i = 0; i < command.length; i++) {
    data[i] = command.charCodeAt(i) & 0xff;
  }
  return data;
}

function test() {
  const transaction = {
    datetime: new Date().toLocaleString(),
    items: [],
    items: [
      { name: "España ñáéíóúü Navegació€Asparagus", quantity: 1, amount: 100 },
      { name: "España ñáéíóúü Navegació€中文", quantity: 2, amount: 200 },
      { name: "España ñáéíóúü Navegació€中文", quantity: 3, amount: 300 },
    ],
    total: 600,
  };

  const template = `^^^RECEIPT

            ${transaction.datetime}
            ${transaction.items
              .map((item) => `${item.name} | ${item.quantity}| ${item.amount}`)
              .join("\n")}
            ---
            ^TOTAL | ^${transaction.total}`;
  const buffer = template2Buffer(template);
}
