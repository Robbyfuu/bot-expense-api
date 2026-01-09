const makeWASocket = jest.fn(() => ({
  ev: {
    on: jest.fn(),
    removeAllListeners: jest.fn(),
    emit: jest.fn(),
  },
  sendPresenceUpdate: jest.fn(),
  sendMessage: jest.fn(),
  end: jest.fn(),
}));

export default makeWASocket;

export const DisconnectReason = {
  loggedOut: 401,
};

export const useMultiFileAuthState = jest.fn().mockResolvedValue({
  state: {},
  saveCreds: jest.fn(),
});

export const fetchLatestBaileysVersion = jest.fn().mockResolvedValue({
  version: [1, 0, 0],
});

export const downloadMediaMessage = jest.fn();

export const proto = {
  IWebMessageInfo: {},
};
