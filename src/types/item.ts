export interface GameItem {
  id: string;
  name: string;
  imageUrl?: string;
  attributes: Record<string, string>;
}
