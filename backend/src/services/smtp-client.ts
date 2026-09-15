import net, { type Socket } from "node:net";
import tls, { type TLSSocket } from "node:tls";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  startTls: boolean;
  username?: string;
  password?: string;
  from: string;
};

type MailInput = { to: string; subject: string; text: string; html: string };

function waitForResponse(socket: Socket | TLSSocket, expected: number[]) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onClose = () => { cleanup(); reject(new Error("SMTP_CONNECTION_CLOSED")); };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const terminal = [...lines].reverse().find((line) => /^\d{3} /.test(line));
      if (!terminal) return;
      cleanup();
      const code = Number(terminal.slice(0, 3));
      if (!expected.includes(code)) return reject(new Error(`SMTP_RESPONSE_${code}`));
      resolve(buffer);
    };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

async function command(socket: Socket | TLSSocket, value: string, expected: number[]) {
  const response = waitForResponse(socket, expected);
  socket.write(`${value}\r\n`);
  return response;
}

function connect(config: SmtpConfig) {
  return new Promise<Socket | TLSSocket>((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.connect({ host: config.host, port: config.port });
    socket.setTimeout(15_000, () => socket.destroy(new Error("SMTP_TIMEOUT")));
    socket.once("error", reject);
    socket.once(config.secure ? "secureConnect" : "connect", () => {
      socket.off("error", reject);
      resolve(socket);
    });
  });
}

function message(config: SmtpConfig, input: MailInput) {
  const boundary = `firewall-alert-${Date.now().toString(36)}`;
  const safeSubject = input.subject.replace(/[\r\n]+/g, " ");
  const safeTo = input.to.replace(/[\r\n]+/g, "");
  const safeFrom = config.from.replace(/[\r\n]+/g, "");
  return [
    `From: ${safeFrom}`,
    `To: ${safeTo}`,
    `Subject: =?UTF-8?B?${Buffer.from(safeSubject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.html,
    `--${boundary}--`,
    ""
  ].join("\r\n").replace(/^\./gm, "..");
}

async function openAuthenticatedConnection(config: SmtpConfig) {
  let socket = await connect(config);
  try {
    await waitForResponse(socket, [220]);
    await command(socket, "EHLO firewall-orchestrator", [250]);
    if (!config.secure && config.startTls) {
      await command(socket, "STARTTLS", [220]);
      const plain = socket;
      socket = await new Promise<TLSSocket>((resolve, reject) => {
        const secured = tls.connect({ socket: plain, servername: config.host });
        secured.once("secureConnect", () => resolve(secured));
        secured.once("error", reject);
      });
      socket.setTimeout(15_000, () => socket.destroy(new Error("SMTP_TIMEOUT")));
      await command(socket, "EHLO firewall-orchestrator", [250]);
    }
    if (config.username && config.password) {
      await command(socket, "AUTH LOGIN", [334]);
      await command(socket, Buffer.from(config.username).toString("base64"), [334]);
      await command(socket, Buffer.from(config.password).toString("base64"), [235]);
    }
    return socket;
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

export async function verifySmtpConnection(config: SmtpConfig) {
  const socket = await openAuthenticatedConnection(config);
  try {
    await command(socket, "QUIT", [221]);
  } finally {
    socket.destroy();
  }
}

export async function sendSmtpMail(config: SmtpConfig, input: MailInput) {
  const socket = await openAuthenticatedConnection(config);
  try {
    await command(socket, `MAIL FROM:<${config.from.replace(/^.*<|>.*$/g, "")}>`, [250]);
    await command(socket, `RCPT TO:<${input.to}>`, [250, 251]);
    await command(socket, "DATA", [354]);
    const accepted = waitForResponse(socket, [250]);
    socket.write(`${message(config, input)}\r\n.\r\n`);
    await accepted;
    await command(socket, "QUIT", [221]);
  } finally {
    socket.destroy();
  }
}
