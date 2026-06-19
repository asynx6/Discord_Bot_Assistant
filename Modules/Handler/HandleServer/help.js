export async function helpHandler(message) {
    const helpText = `
🤖 **DISCORD BOT ASSISTANT v2.0 (Beta)** 🤖

Gak usah hapalin perintah! Sebut aja mau lo apa pake bahasa manusia (bahkan bahasa gaul), gue bakal ngerti. Ini beberapa hal yang bisa gue lakuin:

⚡ **MULTI-AKSI DALAM SATU KALIMAT**
- Lo bisa bilang: *"Bikin kategori Staff, terus bikin 3 channel di dalemnya, dan gembok semuanya"*
- Gue otomatis urutin eksekusinya: Kategori dulu → Role → Channel → Permission

🛡️ **SNAPSHOT & UNDO**
- Setiap aksi yang mengubah server, gue otomatis backup ke database.
- Tinggal bilang *"Undo"* kalo ada yang salah, server balik ke kondisi sebelumnya.

📡 **SERVER & INFORMASI**
- Kepoin statistik dan jeroan server ini.
- Cek profil dan info detail member.
- Kirim pesan atau bikin pengumuman keren pake embed di channel lain.
- Bikin link undangan server (Invite Link).
- Investigasi Audit Log.

🛡️ **MODERASI & KEAMANAN**
- Kick atau Ban orang-orang rusuh.
- Sumpel mulut / bungkam (Timeout) member atau bebasin lagi.
- Kasih peringatan (Warn) resmi lewat DM.
- Bersih-bersih chat (bisa hapus semua pesan orang tertentu atau yang ada link-nya doang).

📁 **MANAJEMEN CHANNEL**
- Bikin, hapus, atau ganti nama channel dan kategori.
- Gembok/buka (Lock/Unlock) channel biar gak ada yang bisa chat atau connect VC.
- Pasang cooldown (Slowmode) biar chat gak spam.
- Ganti topik atau deskripsi channel.
- Duplikat (Clone) channel beserta semua settingannya.

🏷️ **ROLE**
- Bikin, hapus, atau atur warna role server.
- Kasih atau cabut role dari member.
- **Role Massal**: Kasih role ke SEMUA orang di server sekaligus!

🎤 **VOICE**
- Seret orang (atau semua orang) ke Voice Channel lain.
- Tendang orang keluar dari Voice Channel.
- Mute atau Deafen (sumpel kuping) orang di VC.

🎨 **EMOJI**
- Tambahin emoji baru cuma modal link gambar doang.
- Hapus emoji yang udah ada.

💬 **BAHASA GAUL DIDUKUNG**
- "gas kerjakan" = execute/create
- "sumpel mulutnya" = mute/timeout
- "gembok channel" = lock channel
- "buka gembok" = unlock channel
- "sikat" = delete/clean
- "tendang" = kick

*Cara pake: Mention gue @bot [terus sebut mau lo apa]*
Contoh: *@bot bikin kategori Gaming terus isi 3 channel text dan 2 voice, gembok semuanya dari @everyone*
    `;
    return helpText;
}
