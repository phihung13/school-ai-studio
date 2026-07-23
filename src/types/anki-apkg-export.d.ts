// anki-apkg-export không kèm types — khai báo tối thiểu cho phần app dùng
declare module "anki-apkg-export" {
  export default class AnkiExport {
    constructor(deckName: string, options?: Record<string, unknown>);
    addCard(front: string, back: string, options?: { tags?: string[] }): void;
    addMedia(filename: string, data: unknown): void;
    save(): Promise<Buffer | Uint8Array>;
  }
}
