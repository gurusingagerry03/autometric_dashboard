/**
 * Peta "area data" → tabel l2_gold yang mengisinya, dipakai untuk tahu card mana yang
 * datanya sudah siap saat sebuah brand baru pertama kali dihubungkan.
 *
 * KENAPA ADA
 *   Setelah akun dihubungkan, dashboard belum punya apa-apa: scrape menulis l0_raw, lalu
 *   Dagster menjalankan procedure Silver dan Gold satu per satu. Selama itu tiap tab cuma
 *   menampilkan "No data for this filter yet." — tidak bisa dibedakan dari brand yang
 *   datanya memang kosong. Modul ini yang memberi tiap card jawaban sendiri: "punyaku
 *   sedang dibangun" atau "punyaku memang tidak ada".
 *
 * KENAPA TIDAK BERTANYA KE DAGSTER
 *   Tidak perlu. Procedure gold sudah meninggalkan dua jejak di warehouse yang cukup:
 *   barisnya sendiri, dan kolom `built_at`. Menambah tabel status yang ditulis Dagster
 *   berarti perubahan di repo lain plus deploy, untuk informasi yang sebetulnya sudah ada.
 *
 * ============================================================================
 * PERINGATAN — `brand_id` DI GOLD TIDAK SERAGAM
 * ============================================================================
 * Sebagian tabel menyimpan `social_accounts.id` di kolom `brand_id`, sebagian lagi
 * menyimpan `brands.id`. Sebagian procedure memang memetakan akun→brand saat membangun
 * (mis. sp_build_story_funnel join ke brand_social_accounts lalu menulis brand id).
 *
 * Menyaring dengan id yang salah mengembalikan NOL BARIS TANPA ERROR — dan di sini
 * akibatnya card akan menampilkan skeleton selamanya. Daftar `match` di bawah
 * diverifikasi empiris 2026-08-26 dengan mencocokkan tiap kolom ke kedua tabel induk;
 * jangan diubah berdasarkan dugaan, verifikasi ulang dengan cara yang sama.
 * ============================================================================
 */

/** Id apa yang sebenarnya disimpan kolom penyaring tabel ini. */
type Match =
  /** Kolomnya berisi social_accounts.id. */
  | 'account'
  /** Kolomnya berisi brands.id. */
  | 'brand'
  /** Tabel per-post, tidak punya kolom brand sama sekali. */
  | 'none'

interface AreaDef {
  /** Nama tabel di l2_gold. */
  table:  string
  /** Kolom penyaring; null kalau `match` = 'none'. */
  column: string | null
  match:  Match
  /**
   * Tabel ini punya kolom `built_at`. Kalau tidak, "procedure-nya sudah jalan belum"
   * tidak bisa dijawab dan area ini hanya mengandalkan ada/tidaknya baris.
   */
  builtAt: boolean
}

export const DATA_AREAS = {
  // — brand_id berisi social_accounts.id —
  post_metric:                    { table: 'post_metric',                    column: 'brand_id',   match: 'account', builtAt: true  },
  audience_demographics_daily:    { table: 'audience_demographics_daily',    column: 'brand_id',   match: 'account', builtAt: true  },
  audience_geo_daily:             { table: 'audience_geo_daily',             column: 'brand_id',   match: 'account', builtAt: true  },
  posting_time_heatmap:           { table: 'posting_time_heatmap',           column: 'brand_id',   match: 'account', builtAt: true  },
  comment_sentiment_post:         { table: 'comment_sentiment_post',         column: 'brand_id',   match: 'account', builtAt: true  },

  // — brand_id berisi brands.id —
  comment_activity_daily:         { table: 'comment_activity_daily',         column: 'brand_id',   match: 'brand',   builtAt: true  },
  comment_activity_hourly:        { table: 'comment_activity_hourly',        column: 'brand_id',   match: 'brand',   builtAt: true  },
  community_contributors:         { table: 'community_contributors',         column: 'brand_id',   match: 'brand',   builtAt: true  },
  content_attribute_daily:        { table: 'content_attribute_daily',        column: 'brand_id',   match: 'brand',   builtAt: true  },
  pillar_performance_daily:       { table: 'pillar_performance_daily',       column: 'brand_id',   match: 'brand',   builtAt: true  },
  story_metric_daily:             { table: 'story_metric_daily',             column: 'brand_id',   match: 'brand',   builtAt: true  },
  story_type_daily:               { table: 'story_type_daily',               column: 'brand_id',   match: 'brand',   builtAt: true  },
  tiktok_churn_daily:             { table: 'tiktok_churn_daily',             column: 'brand_id',   match: 'brand',   builtAt: true  },
  comment_relevance_distribution: { table: 'comment_relevance_distribution', column: 'brand_id',   match: 'brand',   builtAt: true  },
  comment_sentiment_daily:        { table: 'comment_sentiment_daily',        column: 'brand_id',   match: 'brand',   builtAt: true  },
  // Tanpa built_at: hanya bisa menjawab "sudah ada baris atau belum".
  ugc_tagged_posts:               { table: 'ugc_tagged_posts',               column: 'brand_id',   match: 'brand',   builtAt: false },
  // dim_content_pillar sengaja TIDAK diklaim card mana pun: tabelnya READ-WRITE — isinya
  // disunting user di tab Pillars dan Dagster hanya menyemai (ON CONFLICT DO NOTHING).
  // Menampilkan skeleton di atas suntingan user akan salah. Tetap terdaftar supaya
  // petanya lengkap dan gampang dipakai kalau suatu saat memang dibutuhkan.
  dim_content_pillar:             { table: 'dim_content_pillar',             column: 'brand_id',   match: 'brand',   builtAt: false },

  // — brand_metric_daily satu-satunya yang punya DUA kolom: brand_id (brands.id) dan
  //   account_id (social_accounts.id). Dipakai account_id supaya konsisten dengan
  //   pertanyaan "akun yang baru dihubungkan ini sudah masuk belum".
  brand_metric_daily:             { table: 'brand_metric_daily',             column: 'account_id', match: 'account', builtAt: true  },

  // — Per-post, tidak punya kolom brand. Keduanya milik tab Campaign Analysis yang
  //   on-demand, jadi tidak dibuatkan join mahal ke post_metric; area ini ikut status
  //   onboarding brand saja.
  post_comment_timeline:          { table: 'post_comment_timeline',          column: null,         match: 'none',    builtAt: true  },
  post_wordcloud:                 { table: 'post_wordcloud',                 column: null,         match: 'none',    builtAt: false },
} as const satisfies Record<string, AreaDef>

/**
 * Tiga area di bawah terdaftar tapi belum dipakai <Card> mana pun, dan itu disengaja:
 *
 *   comment_sentiment_daily / comment_sentiment_post
 *     Dibaca fitur Reports (src/lib/reports/*), yang punya komponennya sendiri dan tidak
 *     memakai <Card> dari components/dashboard/ui.
 *   dim_content_pillar
 *     Lihat catatan di atas — tabel yang disunting user, bukan hasil pipeline.
 *
 * Server tetap menghitung statusnya (satu EXISTS tambahan, ~2ms) supaya peta ini lengkap;
 * area yang tidak diklaim card cuma tidak pernah terbaca.
 */
export type DataArea = keyof typeof DATA_AREAS

export const ALL_AREAS = Object.keys(DATA_AREAS) as DataArea[]

/**
 * Nasib satu area untuk brand yang sedang dilihat.
 *
 * - `ready`    datanya sudah ada — gambar seperti biasa
 * - `building` procedure pembangunnya belum sampai ke sini; card menampilkan skeleton
 * - `empty`    procedure-nya SUDAH lewat dan brand ini memang tidak punya data untuk
 *              area itu (mis. brand yang tidak pernah pakai Story). Ini yang menghentikan
 *              skeleton berputar selamanya, dan yang membedakannya dari `building`.
 */
export type AreaState = 'ready' | 'building' | 'empty'
