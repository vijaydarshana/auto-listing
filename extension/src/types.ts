export interface CapturedField {
  id: string;
  name: string;
  value: string;

  tagName: string;

  type?: string;

  placeholder?: string;

  selector: string;

  label?: string;
}

export interface Profile {
  id: string;
  name: string;
  platform: "meesho" | "amazon" | "flipkart" | "unknown";

  fields: CapturedField[];

  createdAt: string;
  updatedAt: string;
}