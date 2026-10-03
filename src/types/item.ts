export interface GameItem {
  id: string;
  name: string;
  imageUrl?: string;
  createdAt?: string;
  attributes: Record<string, string>;
}
