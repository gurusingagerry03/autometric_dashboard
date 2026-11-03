export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Node 22 mencoba tiap alamat IP (IPv4, lalu IPv6) hanya 250 ms sebelum pindah
    // ke alamat berikutnya. CDN yang jauh — cover Instagram yang dilayani
    // scontent-gru1 (São Paulo), RTT ±340 ms dari server — tidak pernah sempat
    // tersambung lewat IPv4, lalu IPv6 yang tidak punya rute di container ikut
    // gagal: `fetch failed` / ETIMEDOUT. Akibatnya gambar post tidak tersalin ke
    // Cloudinary dan hilang dari PPTX (report Fitbar Oktober 2026), padahal curl
    // dan wget di container yang sama berhasil. 2 detik per alamat cukup untuk
    // RTT antarbenua tanpa membuat host yang benar-benar mati menggantung lama.
    const net = await import('node:net')
    net.setDefaultAutoSelectFamilyAttemptTimeout(2000)

    const { startCron } = await import('@/lib/monitoring/cron')
    startCron()
  }
}
