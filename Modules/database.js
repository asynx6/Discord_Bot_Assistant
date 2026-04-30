import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

export async function connectDB() {
    if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes("MASUKKAN")) {
        console.log("MONGODB_URI belum diisi di .env. Fitur Snapshot/Undo dinonaktifkan.");
        return;
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Database MongoDB tersambung!");
    } catch (e) {
        console.error("❌ Gagal nyambung ke MongoDB:", e.message);
    }
}
