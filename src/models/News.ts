import mongoose, { Document, Schema } from "mongoose";

export interface INews extends Document {
  id: string;
  title: string;
  description: string;
  url: string;
  publishedAt: Date;
  coinSymbol: string;
  network: "sui" | "bnb";
  source: string;
  isPosted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NewsSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    url: { type: String, required: true },
    publishedAt: { type: Date, required: true },
    coinSymbol: { type: String, required: true },
    network: { type: String, enum: ["sui", "bnb"], required: true },
    source: { type: String, required: true },
    isPosted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

NewsSchema.index({ network: 1, publishedAt: -1 });
NewsSchema.index({ isPosted: 1 });
NewsSchema.index({ coinSymbol: 1 });

export const News = mongoose.model<INews>("News", NewsSchema);
