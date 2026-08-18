import { DEFAULT_LANG, type Lang } from '@/lib/i18n/translate'

/**
 * Metric glossary — the text shown in the (i) tooltip next to every metric.
 *
 * Source of truth: docs/glosarium_metrik_autometric.md (v1.0, verified against
 * the live DB on 23 Jul 2026). Keep the two in sync: when the doc changes, change
 * the entry here.
 *
 * Canonical keys are `<gold_table>.<column>` because column names repeat across
 * tables (`post_count`, `likes_sum`, `reach_sum` …) and mean different things.
 * The UI never uses those keys directly — screens pass their own key and
 * `lookupMetric()` resolves it through METRIC_ALIASES.
 *
 * Dev-facing remarks from the doc (unit conversions, "don't average this
 * column", grain notes) are deliberately left out — they belong in the doc, not
 * in a tooltip aimed at the person reading the dashboard.
 *
 * BILINGUAL: every entry carries both languages side by side, and `lookupMetric`
 * hands back ONE of them. The pair lives in a single entry rather than being
 * split across this file and the i18n dictionary because the two halves have to
 * be reviewed together — a metric definition that drifts between languages is
 * worse than one that is only available in one.
 */

/** Both languages of one metric, as authored. */
export interface MetricEntry {
  /** Metric name, Indonesian. */
  label: string
  /** Metric name, English. */
  labelEn: string
  /** Plain-language explanation, Indonesian. */
  description: string
  /** Plain-language explanation, English. */
  descriptionEn: string
  /** Optional caveat rendered in a muted second line. */
  caveat?: string
  caveatEn?: string
}

/** One metric in ONE language — what the tooltip actually renders. */
export interface ResolvedMetric {
  label: string
  description: string
  caveat?: string
}

/* ── §1 l2_gold.post_metric — per content ─────────────────────────────────── */

const POST_METRIC: Record<string, MetricEntry> = {
  'post_metric.likes': {
    label: 'Suka', labelEn: 'Likes',
    description: 'Jumlah suka yang diterima konten ini.',
    descriptionEn: 'The number of likes this post received.',
    caveat: 'Khusus Facebook, angka ini mencakup semua jenis reaksi (Like, Love, Haha, dan lainnya).',
    caveatEn: 'On Facebook this figure covers every reaction type (Like, Love, Haha, and the rest).',
  },
  'post_metric.comments': {
    label: 'Komentar', labelEn: 'Comments',
    description: 'Jumlah komentar yang diterima konten ini.',
    descriptionEn: 'The number of comments this post received.',
  },
  'post_metric.shares': {
    label: 'Dibagikan', labelEn: 'Shares',
    description: 'Berapa kali konten ini dibagikan oleh pengguna.',
    descriptionEn: 'How many times people shared this post.',
  },
  'post_metric.saves': {
    label: 'Disimpan', labelEn: 'Saves',
    description: 'Berapa kali konten ini disimpan oleh pengguna.',
    descriptionEn: 'How many times people saved this post.',
    caveat: 'Hanya tersedia untuk Instagram dan TikTok.',
    caveatEn: 'Available for Instagram and TikTok only.',
  },
  'post_metric.reposts': {
    label: 'Repost', labelEn: 'Reposts',
    description: 'Berapa kali konten ini di-repost.',
    descriptionEn: 'How many times this post was reposted.',
    caveat: 'Hanya tersedia untuk Instagram.',
    caveatEn: 'Available for Instagram only.',
  },
  'post_metric.follows': {
    label: 'Follower dari Konten', labelEn: 'Follows from Post',
    description: 'Jumlah follower baru yang mulai mengikuti akun setelah melihat konten ini.',
    descriptionEn: 'New followers who started following the account after seeing this post.',
    caveat: 'Saat ini hanya tersedia untuk Instagram.',
    caveatEn: 'Currently available for Instagram only.',
  },
  'post_metric.reach': {
    label: 'Jangkauan', labelEn: 'Reach',
    description: 'Jumlah akun unik yang melihat konten ini.',
    descriptionEn: 'The number of unique accounts that saw this post.',
  },
  'post_metric.views': {
    label: 'Tayangan', labelEn: 'Views',
    description: 'Berapa kali konten ini ditonton atau dilihat.',
    descriptionEn: 'How many times this post was watched or viewed.',
  },
  'post_metric.impressions': {
    label: 'Impresi', labelEn: 'Impressions',
    description: 'Berapa kali konten ini muncul di layar pengguna, termasuk tayangan berulang oleh orang yang sama.',
    descriptionEn: 'How many times this post appeared on screen, including repeat views by the same person.',
    caveat: 'Hanya tersedia untuk Facebook.',
    caveatEn: 'Available for Facebook only.',
  },
  'post_metric.followers_on_post_day': {
    label: 'Follower saat Tayang', labelEn: 'Followers on Publish Day',
    description: 'Jumlah follower akun pada hari konten ini dipublikasikan. Dipakai sebagai pembanding performa antar konten.',
    descriptionEn: 'The account’s follower count on the day this post went out. Used as a baseline when comparing posts.',
  },
  'post_metric.engagement_owned': {
    label: 'Total Interaksi', labelEn: 'Total Interactions',
    description: 'Total seluruh interaksi pada konten ini. Instagram: suka + komentar + bagikan + simpan + repost. TikTok: suka + komentar + bagikan + simpan. Facebook: reaksi + komentar + bagikan.',
    descriptionEn: 'Every interaction on this post. Instagram: likes + comments + shares + saves + reposts. TikTok: likes + comments + shares + saves. Facebook: reactions + comments + shares.',
  },
  'post_metric.engagement_public': {
    label: 'Interaksi Publik', labelEn: 'Public Interactions',
    description: 'Interaksi yang terlihat oleh publik. Instagram: suka + komentar. Facebook dan TikTok: sama dengan total interaksi.',
    descriptionEn: 'Interactions anyone can see. Instagram: likes + comments. Facebook and TikTok: the same as total interactions.',
  },
  'post_metric.er_reach': {
    label: 'ER (Jangkauan)', labelEn: 'ER (Reach)',
    description: 'Persentase orang yang berinteraksi dibanding jumlah akun yang melihat konten ini. Semakin tinggi, semakin efektif konten memancing interaksi.',
    descriptionEn: 'Interactions as a percentage of the accounts that saw this post. The higher it is, the better the post draws people in.',
  },
  'post_metric.er_views': {
    label: 'ER (Tayangan)', labelEn: 'ER (Views)',
    description: 'Persentase interaksi dibanding jumlah tayangan konten ini.',
    descriptionEn: 'Interactions as a percentage of this post’s views.',
  },
  'post_metric.er_impressions': {
    label: 'ER (Impresi)', labelEn: 'ER (Impressions)',
    description: 'Persentase interaksi dibanding jumlah impresi konten ini.',
    descriptionEn: 'Interactions as a percentage of this post’s impressions.',
    caveat: 'Hanya relevan untuk Facebook.',
    caveatEn: 'Only meaningful for Facebook.',
  },
  'post_metric.er_followers': {
    label: 'ER (Follower)', labelEn: 'ER (Followers)',
    description: 'Persentase interaksi dibanding jumlah follower akun pada hari konten tayang.',
    descriptionEn: 'Interactions as a percentage of the follower count on the day the post went out.',
  },
  'post_metric.avg_watch_time': {
    label: 'Rata-rata Durasi Tonton', labelEn: 'Average Watch Time',
    description: 'Rata-rata lamanya penonton menonton konten video ini.',
    descriptionEn: 'How long viewers watch this video on average.',
    caveat: 'Tersedia untuk Instagram Reels dan TikTok.',
    caveatEn: 'Available for Instagram Reels and TikTok.',
  },
  'post_metric.duration_s': {
    label: 'Durasi', labelEn: 'Duration',
    description: 'Panjang konten video dalam detik.',
    descriptionEn: 'The length of the video in seconds.',
  },
  'post_metric.completion_rate': {
    label: 'Average Completion Rate', labelEn: 'Average Completion Rate',
    description: 'Persentase penonton yang menonton video hingga selesai.',
    descriptionEn: 'The percentage of viewers who watched the video until the end.',
    caveat: 'Hanya tersedia untuk TikTok.',
    caveatEn: 'Available for TikTok only.',
  },
  'post_metric.reels_skip_rate': {
    label: 'Reels Skip Rate', labelEn: 'Reels Skip Rate',
    description: 'Belum tersedia — sumber data dari platform belum menyediakan metrik ini.',
    descriptionEn: 'Not available yet — the platform does not expose this metric.',
  },
  'post_metric.post_type': {
    label: 'Post Type Performance', labelEn: 'Post Type Performance',
    description: 'Perbandingan performa berdasarkan jenis konten yang dipublikasikan, seperti foto, video, Reels, atau carousel.',
    descriptionEn: 'A comparison of performance across different content types, such as images, videos, Reels, or carousels.',
  },
  'post_metric.content_pillar': {
    label: 'Pilar Konten', labelEn: 'Content Pillar',
    description: 'Kategori pilar konten. Dicocokkan otomatis dari hashtag yang dipakai konten.',
    descriptionEn: 'The content pillar this post belongs to, matched automatically from the hashtags it uses.',
  },
  'post_metric.is_campaign': {
    label: 'Campaign', labelEn: 'Campaign',
    description: 'Menandai konten yang merupakan bagian dari sebuah campaign.',
    descriptionEn: 'Marks a post that is part of a campaign.',
  },
  'post_metric.is_boosted': {
    label: 'Beriklan', labelEn: 'Boosted',
    description: 'Menandai konten yang dipromosikan berbayar (boosted).',
    descriptionEn: 'Marks a post that was promoted with paid spend.',
  },
}

/* ── §2 l2_gold.brand_metric_daily — daily per channel ────────────────────── */

const BRAND_DAILY: Record<string, MetricEntry> = {
  'brand_metric_daily.post_count': {
    label: 'Total Posts', labelEn: 'Total Posts',
    description: 'Total konten yang dipublikasikan selama periode yang dipilih.',
    descriptionEn: 'Total content published during the selected period.',
  },
  'brand_metric_daily.engagement_sum': {
    label: 'Total Engagement', labelEn: 'Total Engagement',
    description: 'Total interaksi dari seluruh konten yang tayang pada periode ini, termasuk likes, comments, shares, saves, dan reposts.',
    descriptionEn: 'Total interactions across all content published during this period, including likes, comments, shares, saves, and reposts.',
  },
  'brand_metric_daily.engagement_public_sum': {
    label: 'Interaksi Publik', labelEn: 'Public Interactions',
    description: 'Total interaksi yang terlihat publik dari semua konten yang tayang pada periode ini.',
    descriptionEn: 'Total publicly visible interactions across all content published in this period.',
  },
  'brand_metric_daily.likes_sum': {
    label: 'Suka', labelEn: 'Likes',
    description: 'Total suka dari semua konten yang tayang pada periode ini.',
    descriptionEn: 'Total likes across all content published in this period.',
    caveat: 'Facebook: mencakup semua jenis reaksi.',
    caveatEn: 'Facebook: covers every reaction type.',
  },
  'brand_metric_daily.comments_sum': {
    label: 'Komentar', labelEn: 'Comments',
    description: 'Total komentar dari semua konten yang tayang pada periode ini.',
    descriptionEn: 'Total comments across all content published in this period.',
  },
  'brand_metric_daily.shares_sum': {
    label: 'Dibagikan', labelEn: 'Shares',
    description: 'Total berapa kali konten pada periode ini dibagikan.',
    descriptionEn: 'How many times this period’s content was shared in total.',
  },
  'brand_metric_daily.saves_sum': {
    label: 'Disimpan', labelEn: 'Saves',
    description: 'Total berapa kali konten pada periode ini disimpan.',
    descriptionEn: 'How many times this period’s content was saved in total.',
  },
  'brand_metric_daily.reposts_sum': {
    label: 'Repost', labelEn: 'Reposts',
    description: 'Total repost dari konten pada periode ini.',
    descriptionEn: 'Total reposts of this period’s content.',
    caveat: 'Hanya Instagram.',
    caveatEn: 'Instagram only.',
  },
  'brand_metric_daily.reach_sum': {
    label: 'Reach', labelEn: 'Reach',
    description: 'Total orang yang dijangkau oleh seluruh konten pada periode ini.',
    descriptionEn: 'Total reach across all content published during this period.',
    caveat: 'Orang yang sama dapat terhitung lebih dari sekali jika melihat beberapa konten.',
    caveatEn: 'The same person may be counted more than once across different content.',
  },
  'brand_metric_daily.views_sum': {
    label: 'Tayangan', labelEn: 'Views',
    description: 'Total tayangan dari semua konten yang tayang pada periode ini.',
    descriptionEn: 'Total views across all content published in this period.',
  },
  'brand_metric_daily.impressions_sum': {
    label: 'Impresi', labelEn: 'Impressions',
    description: 'Total impresi dari semua konten yang tayang pada periode ini.',
    descriptionEn: 'Total impressions across all content published in this period.',
    caveat: 'Hanya Facebook.',
    caveatEn: 'Facebook only.',
  },
  'brand_metric_daily.er_reach_daily': {
    label: 'ER (Jangkauan)', labelEn: 'ER (Reach)',
    description: 'Persentase interaksi dibanding jangkauan untuk konten yang tayang pada periode ini.',
    descriptionEn: 'Interactions as a percentage of reach for content published in this period.',
    caveat: 'Untuk rentang beberapa hari, angka dihitung ulang dari total — bukan rata-rata angka harian.',
    caveatEn: 'Over a multi-day range this is recalculated from the totals, not averaged from the daily figures.',
  },
  'brand_metric_daily.er_views_daily': {
    label: 'ER (Tayangan)', labelEn: 'ER (Views)',
    description: 'Persentase interaksi dibanding tayangan untuk konten yang tayang pada periode ini.',
    descriptionEn: 'Interactions as a percentage of views for content published in this period.',
  },
  'brand_metric_daily.er_impressions_daily': {
    label: 'ER (Impresi)', labelEn: 'ER (Impressions)',
    description: 'Persentase interaksi dibanding impresi untuk konten yang tayang pada periode ini.',
    descriptionEn: 'Interactions as a percentage of impressions for content published in this period.',
    caveat: 'Hanya Facebook.',
    caveatEn: 'Facebook only.',
  },
  'brand_metric_daily.er_followers_daily': {
    label: 'ER (Follower)', labelEn: 'ER (Followers)',
    description: 'Persentase interaksi dibanding jumlah follower saat konten tayang.',
    descriptionEn: 'Interactions as a percentage of the follower count at the time the content went out.',
  },
  'brand_metric_daily.follower_count_eod': {
    label: 'Total Follower', labelEn: 'Total Followers',
    description: 'Jumlah follower akun pada akhir periode ini.',
    descriptionEn: 'The account’s follower count at the end of this period.',
  },
  'brand_metric_daily.new_followers_sum': {
    label: 'Follower Baru', labelEn: 'New Followers',
    description: 'Jumlah follower baru yang didapat pada periode ini.',
    descriptionEn: 'New followers gained during this period.',
    caveat: 'Facebook dan TikTok; Instagram hanya menyediakan angka pertumbuhan bersih.',
    caveatEn: 'Facebook and TikTok; Instagram only reports net growth.',
  },
  'brand_metric_daily.lost_followers_sum': {
    label: 'Follower Hilang', labelEn: 'Lost Followers',
    description: 'Jumlah follower yang berhenti mengikuti pada periode ini.',
    descriptionEn: 'Followers who unfollowed during this period.',
    caveat: 'Hanya tersedia untuk TikTok.',
    caveatEn: 'Available for TikTok only.',
  },
  'brand_metric_daily.net_growth_sum': {
    label: 'Net Follower Growth', labelEn: 'Net Follower Growth',
    description: 'Jumlah follower yang bertambah setelah dikurangi follower yang hilang pada periode ini.',
    descriptionEn: 'The difference between new followers gained and followers lost during the selected period.',
  },
  'brand_metric_daily.profile_visit_sum': {
    label: 'Kunjungan Profil', labelEn: 'Profile Visits',
    description: 'Berapa kali profil akun dikunjungi pada periode ini.',
    descriptionEn: 'How many times the account profile was visited during this period.',
  },
  'brand_metric_daily.profile_reach_sum': {
    label: 'Jangkauan Profil', labelEn: 'Profile Reach',
    description: 'Jumlah akun yang terjangkau di tingkat profil pada periode ini.',
    descriptionEn: 'Accounts reached at profile level during this period.',
    caveat: 'Penjumlahan antar hari bisa menghitung orang yang sama lebih dari sekali.',
    caveatEn: 'Summing across days may count the same person more than once.',
  },
  'brand_metric_daily.accounts_engaged_sum': {
    label: 'Akun Berinteraksi', labelEn: 'Accounts Engaged',
    description: 'Jumlah akun unik yang berinteraksi dengan akun ini pada periode ini.',
    descriptionEn: 'Unique accounts that interacted with this account during the period.',
    caveat: 'Hanya tersedia untuk Instagram.',
    caveatEn: 'Available for Instagram only.',
  },
}

/* ── §3 Comments & community ──────────────────────────────────────────────── */

const COMMENTS: Record<string, MetricEntry> = {
  'comment_activity.comment_count': {
    label: 'Jumlah Komentar', labelEn: 'Comment Count',
    description: 'Jumlah komentar yang masuk pada periode ini di semua konten.',
    descriptionEn: 'Comments received across all content during this period.',
  },
  'comment_activity.likes_sum': {
    label: 'Suka pada Komentar', labelEn: 'Likes on Comments',
    description: 'Total suka yang diterima komentar-komentar pada periode ini.',
    descriptionEn: 'Total likes received by comments during this period.',
  },
  'comment_activity.replies_sum': {
    label: 'Balasan Komentar', labelEn: 'Comment Replies',
    description: 'Total balasan yang diterima komentar-komentar pada periode ini.',
    descriptionEn: 'Total replies received by comments during this period.',
  },
  'comment_activity.hour_of_day': {
    label: 'Jam', labelEn: 'Hour of Day',
    description: 'Jam masuknya komentar dalam waktu Indonesia bagian barat (WIB), 0–23.',
    descriptionEn: 'The hour a comment arrived, in Western Indonesia Time (WIB), 0–23.',
  },
  'comment_sentiment.total_comments': {
    label: 'Komentar Dianalisis', labelEn: 'Comments Analysed',
    description: 'Jumlah komentar yang dianalisis sentimennya pada periode ini.',
    descriptionEn: 'How many comments were scored for sentiment during this period.',
  },
  'comment_sentiment.positive_count': {
    label: 'Positif', labelEn: 'Positive',
    description: 'Jumlah komentar bernada positif menurut analisis AI berbahasa Indonesia.',
    descriptionEn: 'Comments read as positive by the Indonesian-language AI analysis.',
  },
  'comment_sentiment.neutral_count': {
    label: 'Netral', labelEn: 'Neutral',
    description: 'Jumlah komentar bernada netral.',
    descriptionEn: 'Comments read as neutral.',
  },
  'comment_sentiment.negative_count': {
    label: 'Negatif', labelEn: 'Negative',
    description: 'Jumlah komentar bernada negatif.',
    descriptionEn: 'Comments read as negative.',
  },
  'comment_sentiment.dominant_sentiment': {
    label: 'Sentimen Dominan', labelEn: 'Dominant Sentiment',
    description: 'Nada komentar yang paling banyak muncul pada konten ini (positif, netral, atau negatif).',
    descriptionEn: 'The tone that appears most often in this post’s comments (positive, neutral, or negative).',
    caveat: 'Bila jumlahnya seri, positif diprioritaskan, lalu negatif.',
    caveatEn: 'On a tie, positive wins, then negative.',
  },
  'comment_relevance.tier': {
    label: 'Tingkat Relevansi', labelEn: 'Relevance Tier',
    description: 'Pengelompokan komentar berdasarkan seberapa relevan isinya dengan konten: Tinggi (skor di atas 75), Sedang (40–75), Rendah (di bawah 40). Skor dihitung otomatis oleh AI, skala 0–100.',
    descriptionEn: 'Comments grouped by how closely they relate to the post: High (above 75), Mid (40–75), Low (below 40). The score is produced automatically by AI on a 0–100 scale.',
  },
  'comment_relevance.comment_count': {
    label: 'Jumlah Komentar', labelEn: 'Comment Count',
    description: 'Jumlah komentar dalam kelompok relevansi ini.',
    descriptionEn: 'How many comments fall into this relevance band.',
  },
  'community_contributors.comments_count': {
    label: 'Komentar', labelEn: 'Comments',
    description: 'Jumlah komentar yang ditulis pengguna ini dalam periode terpilih.',
    descriptionEn: 'How many comments this person wrote during the selected period.',
  },
  'community_contributors.likes_received': {
    label: 'Suka Diterima', labelEn: 'Likes Received',
    description: 'Total suka yang diterima komentar-komentar pengguna ini.',
    descriptionEn: 'Total likes this person’s comments received.',
  },
  'community_contributors.replies_sum': {
    label: 'Balasan Diterima', labelEn: 'Replies Received',
    description: 'Total balasan yang diterima komentar-komentar pengguna ini.',
    descriptionEn: 'Total replies this person’s comments received.',
  },
  'community_contributors.avg_relevance': {
    label: 'Rata-rata Relevansi', labelEn: 'Average Relevance',
    description: 'Rata-rata skor relevansi komentar pengguna ini terhadap konten brand (0–100).',
    descriptionEn: 'The average relevance score of this person’s comments against the brand’s content (0–100).',
  },
  'community_contributors.composite_score': {
    label: 'Skor Kontributor', labelEn: 'Contributor Score',
    description: 'Skor gabungan 0–100: separuh dari tingkat keaktifan (dibandingkan komentator teraktif), separuh dari rata-rata relevansi komentarnya.',
    descriptionEn: 'A combined 0–100 score: half from how active the person is (against the most active commenter), half from the average relevance of their comments.',
  },
  'community_contributors.tier': {
    label: 'Kategori', labelEn: 'Tier',
    description: 'Kategori kontributor berdasarkan skor: Super Fan (70 ke atas), Aktif (40–69), Kasual (di bawah 40).',
    descriptionEn: 'Contributor tier by score: Super Fan (70 and up), Active (40–69), Casual (below 40).',
  },
  'community_contributors.rank_in_window': {
    label: 'Peringkat', labelEn: 'Rank',
    description: 'Peringkat pengguna ini di antara seluruh kontributor pada periode terpilih.',
    descriptionEn: 'Where this person places among all contributors in the selected period.',
  },
  'post_comment_timeline.days_since_post': {
    label: 'Hari ke-', labelEn: 'Days Since Post',
    description: 'Jarak hari antara tanggal komentar dan tanggal konten dipublikasikan. Hari ke-0 berarti komentar masuk di hari yang sama dengan tayangnya konten.',
    descriptionEn: 'The gap in days between the comment and the post going out. Day 0 means the comment arrived the same day.',
  },
  'post_wordcloud.word': {
    label: 'Kata Populer', labelEn: 'Frequent Words',
    description: 'Kata-kata yang paling sering muncul di komentar beserta jumlah kemunculannya. Teks dinormalisasi dan kata umum (stopword), emoji, serta angka murni dibuang.',
    descriptionEn: 'The words that appear most often in the comments, with their counts. Text is normalised, and stop-words, emoji and bare numbers are dropped.',
    caveat: 'Maksimum 50 kata teratas per konten.',
    caveatEn: 'Top 50 words per post at most.',
  },
}

/* ── §4 Pillars & content attributes ──────────────────────────────────────── */

const PILLARS: Record<string, MetricEntry> = {
  'pillar_performance_daily.post_count': {
    label: 'Jumlah Konten', labelEn: 'Post Count',
    description: 'Jumlah konten dengan pilar ini yang tayang pada periode ini.',
    descriptionEn: 'How many posts in this pillar went out during the period.',
  },
  'pillar_performance_daily.engagement_sum': {
    label: 'Total Interaksi', labelEn: 'Total Interactions',
    description: 'Total interaksi dari konten pilar ini yang tayang pada periode ini.',
    descriptionEn: 'Total interactions on this pillar’s content during the period.',
  },
  'pillar_performance_daily.reach_sum': {
    label: 'Jangkauan', labelEn: 'Reach',
    description: 'Total jangkauan konten pilar ini pada periode ini.',
    descriptionEn: 'Total reach of this pillar’s content during the period.',
  },
  'pillar_performance_daily.views_sum': {
    label: 'Tayangan', labelEn: 'Views',
    description: 'Total tayangan konten pilar ini pada periode ini.',
    descriptionEn: 'Total views of this pillar’s content during the period.',
  },
  'pillar_performance_daily.watch_time_sum': {
    label: 'Durasi Tonton per Pilar', labelEn: 'Watch Time by Pillar',
    description: 'Penjumlahan rata-rata durasi tonton tiap konten pada pilar ini.',
    descriptionEn: 'The sum of each post’s average watch time within this pillar.',
    caveat: 'Ini bukan total waktu tonton sesungguhnya — bagi dengan jumlah konten untuk mendapat rata-rata antar konten.',
    caveatEn: 'This is not true total watch time — divide by the post count to get the average across posts.',
  },
  'content_attribute_daily.content_tag': {
    label: 'Atribut Konten', labelEn: 'Content Attribute',
    description: 'Penanda jenis konten: beriklan (boosted), kolaborasi, campaign, event, aon, activity, repost, atau organik.',
    descriptionEn: 'A tag on the post: boosted, collab, campaign, event, aon, activity, repost, or organic.',
    caveat: 'Satu konten bisa memiliki lebih dari satu atribut.',
    caveatEn: 'A single post can carry more than one attribute.',
  },
  'content_attribute_daily.post_count': {
    label: 'Jumlah Konten', labelEn: 'Post Count',
    description: 'Jumlah konten dengan atribut ini yang tayang pada periode ini.',
    descriptionEn: 'How many posts with this attribute went out during the period.',
    caveat: 'Karena satu konten bisa punya beberapa atribut, angka antar-atribut tidak boleh dijumlahkan.',
    caveatEn: 'Because a post can carry several attributes, these counts must not be added together.',
  },
  'content_attribute_daily.engagement_sum': {
    label: 'Total Interaksi', labelEn: 'Total Interactions',
    description: 'Total interaksi dari konten dengan atribut ini pada periode ini.',
    descriptionEn: 'Total interactions on posts carrying this attribute during the period.',
  },
  'dim_content_pillar.content_pillar': {
    label: 'Pilar Konten', labelEn: 'Content Pillar',
    description: 'Nama pilar atau kategori konten yang ditetapkan brand.',
    descriptionEn: 'The name of the pillar or content category the brand defined.',
  },
  'dim_content_pillar.hashtags': {
    label: 'Hashtag Pemicu', labelEn: 'Trigger Hashtags',
    description: 'Daftar hashtag pemicu — konten yang memakai salah satu hashtag ini otomatis dikategorikan ke pilar ini.',
    descriptionEn: 'The trigger hashtags — a post using any of them is filed under this pillar automatically.',
  },
}

/* ── §5 Stories (Instagram) ───────────────────────────────────────────────── */

const STORIES: Record<string, MetricEntry> = {
  'story_metric_daily.story_count': {
    label: 'Jumlah Story', labelEn: 'Story Count',
    description: 'Jumlah story yang tayang pada periode ini.',
    descriptionEn: 'How many stories went out during this period.',
  },
  'story_metric_daily.reach_sum': {
    label: 'Jangkauan Story', labelEn: 'Story Reach',
    description: 'Total akun unik yang melihat story pada periode ini.',
    descriptionEn: 'Unique accounts that saw the stories during this period.',
  },
  'story_metric_daily.views_sum': {
    label: 'Tayangan Story', labelEn: 'Story Views',
    description: 'Total berapa kali story pada periode ini dilihat.',
    descriptionEn: 'How many times this period’s stories were viewed in total.',
  },
  'story_metric_daily.replies_sum': {
    label: 'Balasan', labelEn: 'Replies',
    description: 'Jumlah balasan (DM) yang diterima story pada periode ini.',
    descriptionEn: 'Replies (DMs) the stories received during this period.',
  },
  'story_metric_daily.taps_fwd_sum': {
    label: 'Tap Maju', labelEn: 'Taps Forward',
    description: 'Berapa kali penonton mengetuk untuk melompat ke story berikutnya.',
    descriptionEn: 'How many times viewers tapped to skip to the next story.',
    caveat: 'Angka tinggi bisa berarti story kurang menahan perhatian.',
    caveatEn: 'A high number can mean the stories are not holding attention.',
  },
  'story_metric_daily.taps_back_sum': {
    label: 'Tap Mundur', labelEn: 'Taps Back',
    description: 'Berapa kali penonton mengetuk untuk kembali menonton ulang story sebelumnya.',
    descriptionEn: 'How many times viewers tapped back to rewatch the previous story.',
    caveat: 'Angka tinggi biasanya pertanda konten menarik.',
    caveatEn: 'A high number is usually a sign the content is compelling.',
  },
  'story_metric_daily.exits_sum': {
    label: 'Keluar', labelEn: 'Exits',
    description: 'Berapa kali penonton keluar dari story sebelum selesai.',
    descriptionEn: 'How many times viewers left the story before it finished.',
  },
  'story_metric_daily.swipe_up_sum': {
    label: 'Buka Tautan', labelEn: 'Link Opens',
    description: 'Berapa kali penonton membuka tautan yang dipasang di story.',
    descriptionEn: 'How many times viewers opened the link attached to a story.',
  },
  'story_metric_daily.follows_sum': {
    label: 'Follower dari Story', labelEn: 'Follows from Stories',
    description: 'Jumlah follower baru yang datang setelah melihat story pada periode ini.',
    descriptionEn: 'New followers who arrived after watching a story during this period.',
  },
  'story_type_daily.story_type': {
    label: 'Tipe Story', labelEn: 'Story Type',
    description: 'Jenis story, misalnya foto atau video. Nilai "unknown" berarti tipe tidak terdeteksi dari sumber data.',
    descriptionEn: 'The kind of story, such as image or video. "Unknown" means the type could not be detected from the source data.',
  },
}

/* ── §6 Followers & audience ──────────────────────────────────────────────── */

const AUDIENCE: Record<string, MetricEntry> = {
  'tiktok_churn_daily.new_followers': {
    label: 'Follower Baru', labelEn: 'New Followers',
    description: 'Jumlah follower baru TikTok pada periode ini.',
    descriptionEn: 'New TikTok followers during this period.',
  },
  'tiktok_churn_daily.lost_followers': {
    label: 'Follower Hilang', labelEn: 'Lost Followers',
    description: 'Jumlah follower TikTok yang berhenti mengikuti pada periode ini.',
    descriptionEn: 'TikTok followers who unfollowed during this period.',
  },
  'tiktok_churn_daily.net_growth': {
    label: 'Pertumbuhan Bersih', labelEn: 'Net Growth',
    description: 'Selisih follower baru dan follower yang hilang pada periode ini.',
    descriptionEn: 'New followers minus lost followers for this period.',
  },
  'tiktok_churn_daily.video_views_sum': {
    label: 'TikTok Video Views', labelEn: 'TikTok Video Views',
    description: 'Total tayangan video TikTok pada periode yang dipilih, berdasarkan data dari tingkat profil.',
    descriptionEn: 'Total TikTok video views during the selected period, based on profile-level data.',
  },
  'audience_demographics_daily.age': {
    label: 'Kelompok Usia', labelEn: 'Age Group',
    description: 'Jumlah audiens pada tiap kelompok usia.',
    descriptionEn: 'How much of the audience falls into each age band.',
  },
  'audience_demographics_daily.gender': {
    label: 'Gender', labelEn: 'Gender',
    description: 'Jumlah audiens per gender. "Tidak diketahui" berarti platform tidak memiliki data gender pengguna tersebut.',
    descriptionEn: 'Audience split by gender. "Unknown" means the platform holds no gender data for those users.',
  },
  'audience_demographics_daily.audience_type': {
    label: 'Tipe Audiens', labelEn: 'Audience Type',
    description: 'Jenis audiens yang diukur: demografi seluruh follower akun, atau demografi audiens yang berinteraksi dengan konten.',
    descriptionEn: 'Which audience is measured: the demographics of all followers, or of the people who engaged with the content.',
  },
  'audience_geo_daily.geo': {
    label: 'Lokasi Audiens', labelEn: 'Audience Location',
    description: 'Sebaran audiens per kota atau per negara.',
    descriptionEn: 'Where the audience sits, by city or by country.',
  },
  'audience_geo_daily.audience_count': {
    label: 'Jumlah Audiens', labelEn: 'Audience Count',
    description: 'Jumlah audiens dari lokasi ini.',
    descriptionEn: 'How many people in the audience come from this location.',
  },
}

/* ── §7 Competitors ───────────────────────────────────────────────────────── */

const COMPETITOR: Record<string, MetricEntry> = {
  'competitor_post_metric.like_count': {
    label: 'Suka', labelEn: 'Likes',
    description: 'Jumlah suka konten kompetitor.',
    descriptionEn: 'Likes on the competitor’s post.',
    caveat: 'Facebook: mencakup semua jenis reaksi.',
    caveatEn: 'Facebook: covers every reaction type.',
  },
  'competitor_post_metric.comment_count': {
    label: 'Komentar', labelEn: 'Comments',
    description: 'Jumlah komentar konten kompetitor.',
    descriptionEn: 'Comments on the competitor’s post.',
    caveat: 'Tidak tersedia untuk Facebook.',
    caveatEn: 'Not available for Facebook.',
  },
  'competitor_post_metric.share_count': {
    label: 'Dibagikan', labelEn: 'Shares',
    description: 'Berapa kali konten kompetitor dibagikan.',
    descriptionEn: 'How many times the competitor’s post was shared.',
    caveat: 'Tidak tersedia untuk Instagram.',
    caveatEn: 'Not available for Instagram.',
  },
  'competitor_post_metric.view_count': {
    label: 'Tayangan', labelEn: 'Views',
    description: 'Berapa kali konten kompetitor ditonton.',
    descriptionEn: 'How many times the competitor’s post was viewed.',
    caveat: 'Tidak tersedia untuk Facebook.',
    caveatEn: 'Not available for Facebook.',
  },
  'competitor_post_metric.save_count': {
    label: 'Disimpan', labelEn: 'Saves',
    description: 'Berapa kali konten kompetitor disimpan.',
    descriptionEn: 'How many times the competitor’s post was saved.',
    caveat: 'Hanya tersedia untuk TikTok.',
    caveatEn: 'Available for TikTok only.',
  },
  'competitor_profile_metric_daily.follower_count': {
    label: 'Follower Kompetitor', labelEn: 'Competitor Followers',
    description: 'Jumlah follower akun kompetitor pada periode ini.',
    descriptionEn: 'The competitor account’s follower count during this period.',
  },
  'competitor_profile_metric_daily.following_count': {
    label: 'Mengikuti', labelEn: 'Following',
    description: 'Jumlah akun yang diikuti kompetitor.',
    descriptionEn: 'How many accounts the competitor follows.',
    caveat: 'Tidak tersedia untuk Facebook.',
    caveatEn: 'Not available for Facebook.',
  },
  'competitor_profile_metric_daily.followers_growth': {
    label: 'Pertumbuhan Follower', labelEn: 'Follower Growth',
    description: 'Perubahan jumlah follower kompetitor pada periode ini.',
    descriptionEn: 'How the competitor’s follower count changed during this period.',
  },
  'competitor_profile_metric_daily.post_count': {
    label: 'Konten Kompetitor', labelEn: 'Competitor Posts',
    description: 'Jumlah konten yang dipublikasikan kompetitor pada periode ini.',
    descriptionEn: 'How much content the competitor published during this period.',
  },
  'ugc_tagged_posts.username': {
    label: 'Pengguna', labelEn: 'User',
    description: 'Akun publik yang membuat konten dan menandai brand ini.',
    descriptionEn: 'The public account that made the post and tagged this brand.',
    caveat: 'Saat ini hanya Instagram.',
    caveatEn: 'Instagram only for now.',
  },
  'ugc_tagged_posts.total_engagement': {
    label: 'Total Interaksi UGC', labelEn: 'Total UGC Interactions',
    description: 'Jumlah suka ditambah komentar pada konten buatan pengguna tersebut.',
    descriptionEn: 'Likes plus comments on that user’s post.',
  },
}

/* ── §8 Posting time ──────────────────────────────────────────────────────── */

const POSTING_TIME: Record<string, MetricEntry> = {
  'posting_time_heatmap.post_count': {
    label: 'Jumlah Konten', labelEn: 'Post Count',
    description: 'Jumlah konten yang pernah tayang pada kombinasi hari dan jam ini.',
    descriptionEn: 'How many posts have ever gone out in this day-and-hour slot.',
    caveat: 'Dihitung sepanjang masa, tidak mengikuti filter periode.',
    caveatEn: 'Counted over all time — it does not follow the period filter.',
  },
  'posting_time_heatmap.engagement_sum': {
    label: 'Total Interaksi', labelEn: 'Total Interactions',
    description: 'Total interaksi dari konten yang tayang pada kombinasi hari dan jam ini — untuk melihat waktu posting yang paling efektif.',
    descriptionEn: 'Total interactions on posts published in this day-and-hour slot — the basis for finding the most effective posting time.',
    caveat: 'Dihitung sepanjang masa, tidak mengikuti filter periode.',
    caveatEn: 'Counted over all time — it does not follow the period filter.',
  },
  'posting_time_heatmap.reach_sum': {
    label: 'Jangkauan', labelEn: 'Reach',
    description: 'Total jangkauan konten pada slot waktu ini.',
    descriptionEn: 'Total reach of posts in this time slot.',
  },
  'posting_time_heatmap.views_sum': {
    label: 'Tayangan', labelEn: 'Views',
    description: 'Total tayangan konten pada slot waktu ini.',
    descriptionEn: 'Total views of posts in this time slot.',
  },
}

/* ── Derived metrics — shown in the UI but computed on the fly ────────────── */
/* These have no Gold column of their own, so their wording is written here in
   the same voice as the glossary rather than copied from it. */

const DERIVED: Record<string, MetricEntry> = {
  'derived.blended_er': {
    label: 'Blended Engagement Rate', labelEn: 'Blended Engagement Rate',
    description: 'Tingkat interaksi gabungan dari seluruh channel pada periode yang dipilih.',
    descriptionEn: 'The combined engagement rate across all channels during the selected period.',
    caveat: 'Dihitung dari total interaksi dibandingkan dengan total basis perhitungan, bukan dari rata-rata engagement rate harian.',
    caveatEn: 'Calculated using the total interactions and overall calculation base, rather than averaging daily engagement rates.',
  },
  'derived.avg_saves_rate': {
    label: 'Average Saves Rate', labelEn: 'Average Saves Rate',
    description: 'Persentase simpan dibandingkan dengan jangkauan konten, yang menunjukkan seberapa sering konten dianggap layak untuk disimpan.',
    descriptionEn: 'The percentage of saves relative to content reach, showing how often people find the content worth saving.',
    caveat: 'Hanya tersedia untuk Instagram.',
    caveatEn: 'Available for Instagram only.',
  },
  'derived.swipe_up_rate': {
    label: 'Swipe-Up Rate', labelEn: 'Swipe-Up Rate',
    description: 'Persentase penonton story yang membuka tautan yang dipasang, dibanding jumlah yang melihat story.',
    descriptionEn: 'The share of story viewers who opened the attached link.',
  },
  'derived.exit_rate': {
    label: 'Exit Rate', labelEn: 'Exit Rate',
    description: 'Persentase penonton yang keluar dari story sebelum selesai, dibanding jumlah yang melihatnya. Semakin rendah semakin baik.',
    descriptionEn: 'The share of story viewers who left before the end. Lower is better.',
  },
  'derived.avg_story_reach': {
    label: 'Rata-rata Jangkauan Story', labelEn: 'Average Story Reach',
    description: 'Rata-rata jumlah akun unik yang melihat tiap story pada periode terpilih.',
    descriptionEn: 'The average number of unique accounts that saw each story in the selected period.',
  },
  'derived.likes_per_comment': {
    label: 'Rata-rata Suka per Komentar', labelEn: 'Average Likes per Comment',
    description: 'Rata-rata jumlah suka yang diterima setiap komentar. Menunjukkan seberapa besar komentar ikut memancing interaksi lanjutan.',
    descriptionEn: 'How many likes a comment attracts on average — a read on whether the comments themselves spark further interaction.',
  },
  'derived.replies_per_comment': {
    label: 'Rata-rata Balasan per Komentar', labelEn: 'Average Replies per Comment',
    description: 'Rata-rata jumlah balasan yang diterima setiap komentar, termasuk balasan dari brand sendiri.',
    descriptionEn: 'How many replies a comment attracts on average, including replies from the brand itself.',
  },
  'derived.comments_rate': {
    label: 'Comments Rate', labelEn: 'Comments Rate',
    description: 'Persentase komentar dibanding jangkauan konten. Menunjukkan seberapa besar konten memancing percakapan.',
    descriptionEn: 'Comments as a percentage of reach — how strongly the content pulls people into conversation.',
  },
  'derived.total_comments_tracked': {
    label: 'Total Komentar Terlacak', labelEn: 'Total Comments Tracked',
    description: 'Jumlah seluruh komentar yang berhasil ditarik dari semua channel pada periode terpilih.',
    descriptionEn: 'Every comment pulled in across all channels during the selected period.',
  },
  'derived.total_tracked_followers': {
    label: 'Total Follower Terlacak', labelEn: 'Total Tracked Followers',
    description: 'Jumlah follower dari seluruh channel yang terhubung, dijumlahkan pada akhir periode terpilih.',
    descriptionEn: 'Followers across every connected channel, added up at the end of the selected period.',
    caveat: 'Satu orang yang mengikuti beberapa channel terhitung lebih dari sekali.',
    caveatEn: 'Someone who follows several channels is counted more than once.',
  },
  'derived.link_clicks_fb': {
    label: 'Link Clicks', labelEn: 'Link Clicks',
    description: 'Total berapa kali tautan dalam konten diklik selama periode yang dipilih.',
    descriptionEn: 'Total number of times links in the content were clicked during the selected period.',
    caveat: 'Hanya tersedia untuk Facebook.',
    caveatEn: 'Available for Facebook only.',
  },
  'derived.profile_views': {
    label: 'Kunjungan Profil', labelEn: 'Profile Views',
    description: 'Berapa kali halaman profil akun dibuka pada periode terpilih.',
    descriptionEn: 'How many times the account’s profile page was opened during the selected period.',
  },
  'derived.impressions_views': {
    label: 'Impresi / Tayangan', labelEn: 'Impressions / Views',
    description: 'Gabungan impresi dan tayangan dalam satu kolom: Facebook memakai impresi, Instagram dan TikTok memakai tayangan.',
    descriptionEn: 'Impressions and views folded into one column: Facebook contributes impressions, Instagram and TikTok contribute views.',
  },
  'derived.er_pooled': {
    label: 'ER (Gabungan)', labelEn: 'ER (Pooled)',
    description: 'Tingkat interaksi yang dihitung dari total seluruh konten pada periode — total interaksi dibagi total penyebut.',
    descriptionEn: 'Engagement rate computed from the period’s totals — total interactions over the total denominator.',
    caveat: 'Berbeda dari "Avg. ER" yang merata-ratakan ER tiap konten.',
    caveatEn: 'Different from "Avg. ER", which averages each post’s own ER.',
  },
  'derived.er_avg': {
    label: 'Rata-rata ER', labelEn: 'Average ER',
    description: 'Rata-rata dari tingkat interaksi tiap konten pada periode terpilih.',
    descriptionEn: 'The average of each post’s engagement rate over the selected period.',
    caveat: 'Berbeda dari ER gabungan yang menghitung dari total.',
    caveatEn: 'Different from pooled ER, which is computed from the totals.',
  },
  'derived.website_clicks': {
    label: 'Website Clicks', labelEn: 'Website Clicks',
    description: 'Berapa kali tautan yang dipasang di profil atau konten diklik oleh pengguna.',
    descriptionEn: 'How many times people clicked the link on the profile or in the content.',
    caveat: 'Hanya tersedia untuk Instagram dan Facebook.',
    caveatEn: 'Available for Instagram and Facebook only.',
  },
  'derived.total_interactions_profile': {
    label: 'Total Interactions', labelEn: 'Total Interactions',
    description: 'Total interaksi di tingkat channel yang dilaporkan langsung oleh platform, mencakup interaksi di luar konten yang tayang pada periode ini.',
    descriptionEn: 'Channel-level interactions as reported by the platform itself, including interactions outside the content published in this period.',
    caveat: 'Hanya tersedia untuk Instagram dan TikTok. Berbeda dari Engagement yang dijumlahkan dari konten.',
    caveatEn: 'Available for Instagram and TikTok only. Different from Engagement, which is summed from the posts.',
  },
  'derived.followers_growth_pct': {
    label: 'Pertumbuhan Follower (%)', labelEn: 'Follower Growth (%)',
    description: 'Pertumbuhan bersih follower pada periode ini dinyatakan dalam persen terhadap jumlah follower di awal periode.',
    descriptionEn: 'Net follower growth for the period, as a percentage of the follower count at the start of it.',
  },
  'derived.avg_per_post': {
    label: 'Rata-rata per Konten', labelEn: 'Average per Post',
    description: 'Nilai rata-rata metrik ini dibagi jumlah konten yang tayang pada periode terpilih.',
    descriptionEn: 'This metric divided by the number of posts published in the selected period.',
  },
  'derived.post_er': {
    label: 'Engagement Rate Konten', labelEn: 'Post Engagement Rate',
    description: 'Persentase interaksi terhadap sebaran konten ini.',
    descriptionEn: 'Interactions on this post as a percentage of how far it travelled.',
    caveat: 'Penyebutnya mengikuti platform: TikTok dihitung dari tayangan, Instagram dan Facebook dari jangkauan — jadi angka antar platform tidak sepenuhnya setara.',
    caveatEn: 'The denominator follows the platform: TikTok uses views, Instagram and Facebook use reach — so figures are not strictly comparable across platforms.',
  },
  'derived.engagement_trend': {
    label: 'Tren', labelEn: 'Trend',
    description: 'Arah pergerakan interaksi: membandingkan paruh kedua periode terpilih dengan paruh pertamanya. Panah naik berarti selisihnya di atas 5%, turun berarti di bawah −5%, selain itu dianggap datar.',
    descriptionEn: 'Direction of engagement: the second half of the selected period compared with the first. Up means more than 5% higher, down more than 5% lower, otherwise flat.',
  },
  'derived.comments_per_day': {
    label: 'Komentar per Hari', labelEn: 'Comments per Day',
    description: 'Rata-rata jumlah komentar yang ditulis akun ini per hari selama periode terpilih.',
    descriptionEn: 'Average number of comments this account posts per day over the selected period.',
  },
  /* ── Chart/card explanations (client copy, docs/kepiai-Feedback copy.pdf) ──
     These describe a VISUAL, not a raw column, and several of them sit on a card
     whose underlying metric already has its own entry (post_count, completion_rate,
     avg_watch_time). They get their own keys so the card can say what the chart
     shows without overwriting what the metric itself means elsewhere. */
  'derived.engagement_over_time': {
    label: 'Interaksi dari Waktu ke Waktu', labelEn: 'Engagement Over Time',
    description: 'Pergerakan harian metrik yang dipilih untuk tiap brand pada periode terpilih, agar lonjakan dan penurunannya terlihat berurutan.',
    descriptionEn: 'The day-by-day movement of the selected metric for each brand over the period, so spikes and dips can be read in sequence.',
  },
  'derived.top_posts': {
    label: 'Konten Teratas', labelEn: 'Top Posts',
    description: 'Konten dengan engagement rate tertinggi pada periode terpilih, digabung dari semua platform.',
    descriptionEn: 'The posts with the highest engagement rate in the selected period, pooled across every platform.',
    caveat: 'Penyebut ER mengikuti platform, jadi peringkat antar platform tidak sepenuhnya setara.',
    caveatEn: 'The ER denominator follows the platform, so ranking across platforms is not strictly like-for-like.',
  },
  'derived.platform_share': {
    label: 'Platform Share', labelEn: 'Platform Share',
    description: 'Menunjukkan seberapa besar kontribusi masing-masing platform terhadap total reach pada periode yang dipilih.',
    descriptionEn: 'The percentage contribution of each platform to the total performance during the selected period.',
  },
  'derived.content_attribute_breakdown': {
    label: 'Content Attribute Breakdown', labelEn: 'Content Attribute Breakdown',
    description: 'Performa engagement rate berdasarkan tag konten, dibandingkan dengan rata-rata keseluruhan.',
    descriptionEn: 'Engagement rate performance by content tag, compared with the overall average.',
  },
  'derived.brand_benchmarking': {
    label: 'Cross-brand, Cross-platform Benchmarking', labelEn: 'Cross-brand, Cross-platform Benchmarking',
    description: 'Perbandingan performa engagement antar brand dan platform dalam keseluruhan portofolio.',
    descriptionEn: 'Compare engagement performance across brands and platforms within the portfolio.',
  },
  'derived.content_volume_weekly': {
    label: 'Content Volume by Week', labelEn: 'Content Volume by Week',
    description: 'Jumlah konten yang dipublikasikan setiap minggu selama periode yang dipilih.',
    descriptionEn: 'The number of posts published each week during the selected period.',
  },
  'derived.completion_rate_distribution': {
    label: 'TikTok Completion Rate Distribution', labelEn: 'TikTok Completion Rate Distribution',
    description: 'Distribusi konten TikTok berdasarkan tingkat penyelesaian tontonan, dari video yang hanya ditonton sebagian hingga selesai.',
    descriptionEn: 'The distribution of TikTok content based on completion rate, showing how much of each video viewers typically watch.',
  },
  'derived.reel_watch_by_duration': {
    label: 'Reel Watch Time by Duration', labelEn: 'Reel Watch Time by Duration',
    description: 'Perbandingan rata-rata tingkat tontonan Reels berdasarkan durasi video, untuk melihat durasi mana yang paling efektif mempertahankan penonton.',
    descriptionEn: 'A comparison of average watch performance across different Reel lengths, showing which durations retain viewers best.',
  },
}

export const METRIC_GLOSSARY: Record<string, MetricEntry> = {
  ...POST_METRIC,
  ...BRAND_DAILY,
  ...COMMENTS,
  ...PILLARS,
  ...STORIES,
  ...AUDIENCE,
  ...COMPETITOR,
  ...POSTING_TIME,
  ...DERIVED,
}

/**
 * UI key → canonical glossary key.
 *
 * Screens name their metrics for their own convenience ('kpi:reach',
 * 'rkpi:saves', 'avg_likes'); this maps those onto the one entry that defines
 * what the number actually means.
 */
export const METRIC_ALIASES: Record<string, string> = {
  /* ── Dashboard: Overview ── */
  'kpi:reach':     'brand_metric_daily.reach_sum',
  'kpi:eng':       'brand_metric_daily.engagement_sum',
  'kpi:er':        'derived.blended_er',
  'kpi:views':     'tiktok_churn_daily.video_views_sum',
  'kpi:posts':     'brand_metric_daily.post_count',
  'kpi:foll':      'derived.total_tracked_followers',
  'kpi:followers': 'brand_metric_daily.follower_count_eod',
  'kpi:growth':    'brand_metric_daily.net_growth_sum',
  'kpi:impr':      'brand_metric_daily.impressions_sum',

  /* ── Dashboard: Content ── */
  'kpi:saves':  'derived.avg_saves_rate',
  'kpi:compl':  'post_metric.completion_rate',
  'kpi:clicks': 'derived.link_clicks_fb',

  /* ── Dashboard: Audience ── */
  'kpi:igr': 'brand_metric_daily.profile_reach_sum',
  'kpi:fbv': 'brand_metric_daily.profile_visit_sum',
  'kpi:tkv': 'derived.profile_views',

  /* ── Dashboard: Stories ── */
  'kpi:s-pub':   'story_metric_daily.story_count',
  'kpi:s-reach': 'derived.avg_story_reach',
  'kpi:s-swipe': 'derived.swipe_up_rate',
  'kpi:s-exit':  'derived.exit_rate',

  /* ── Dashboard: TikTok ── */
  'kpi:tk-new':   'tiktok_churn_daily.new_followers',
  'kpi:tk-lost':  'tiktok_churn_daily.lost_followers',
  'kpi:tk-net':   'tiktok_churn_daily.net_growth',
  'kpi:tk-views': 'tiktok_churn_daily.video_views_sum',
  'kpi:tk-compl': 'post_metric.completion_rate',

  /* ── Dashboard: Community ── */
  'kpi:c-total':    'derived.total_comments_tracked',
  'kpi:c-fbl':      'derived.likes_per_comment',
  'kpi:c-tkr':      'derived.likes_per_comment',
  'kpi:c-igr':      'derived.replies_per_comment',
  'kpi:c-comments': 'derived.comments_rate',

  /* ── Report: content-level metrics ── */
  likes:               'post_metric.likes',
  comments:            'post_metric.comments',
  shares:              'post_metric.shares',
  saved:               'post_metric.saves',
  saves:               'post_metric.saves',
  reposts:             'post_metric.reposts',
  reach:               'post_metric.reach',
  post_reach:          'post_metric.reach',
  eng_owned:           'post_metric.engagement_owned',
  engagement:          'post_metric.engagement_owned',
  total_interactions:  'post_metric.engagement_owned',
  eng_public:          'post_metric.engagement_public',
  impressions:         'post_metric.impressions',
  impressions_views:   'derived.impressions_views',
  video_views:         'brand_metric_daily.views_sum',
  new_follow:          'post_metric.follows',
  new_follow_content:  'post_metric.follows',
  watch_time:          'post_metric.avg_watch_time',
  video_watch_time:    'post_metric.avg_watch_time',
  post_view_time:      'post_metric.avg_watch_time',
  completion:          'post_metric.completion_rate',
  post_completion:     'post_metric.completion_rate',
  reels_skip_rate:     'post_metric.reels_skip_rate',
  er_reach:            'derived.er_avg',
  er_views:            'derived.er_avg',
  er_followers:        'derived.er_avg',
  er_impressions:      'post_metric.er_impressions',
  er_reach_pooled:     'derived.er_pooled',
  er_views_pooled:     'derived.er_pooled',
  er_followers_pooled: 'derived.er_pooled',

  /* ── Report: channel-level metrics ── */
  total_followers:      'brand_metric_daily.follower_count_eod',
  followers_net_growth: 'brand_metric_daily.net_growth_sum',
  followers_growth:     'brand_metric_daily.net_growth_sum',
  followers_growth_pct: 'derived.followers_growth_pct',
  new_follows:          'brand_metric_daily.new_followers_sum',
  new_followers:        'brand_metric_daily.new_followers_sum',
  unfollows:            'brand_metric_daily.lost_followers_sum',
  profile_reach:        'brand_metric_daily.profile_reach_sum',
  profile_views:        'derived.profile_views',
  visits:               'derived.profile_views',
  profile_visit:        'brand_metric_daily.profile_visit_sum',
  total_posts:          'brand_metric_daily.post_count',
  post_count:           'brand_metric_daily.post_count',
  number_of_posts:      'brand_metric_daily.post_count',

  views:     'brand_metric_daily.views_sum',

  /* ── Report: KPI picker (channel aggregates, see kpiQuery) ── */
  'rkpi:reach':              'brand_metric_daily.reach_sum',
  'rkpi:impressions':        'brand_metric_daily.impressions_sum',
  'rkpi:followers':          'brand_metric_daily.follower_count_eod',
  'rkpi:growth':             'brand_metric_daily.net_growth_sum',
  'rkpi:engagement':         'brand_metric_daily.engagement_sum',
  'rkpi:er':                 'derived.blended_er',
  'rkpi:likes':              'brand_metric_daily.likes_sum',
  'rkpi:comments':           'brand_metric_daily.comments_sum',
  'rkpi:saves':              'brand_metric_daily.saves_sum',
  'rkpi:shares':             'brand_metric_daily.shares_sum',
  'rkpi:reposts':            'brand_metric_daily.reposts_sum',
  'rkpi:views':              'brand_metric_daily.views_sum',
  'rkpi:visits':             'brand_metric_daily.profile_visit_sum',
  'rkpi:new_followers':      'brand_metric_daily.new_followers_sum',
  'rkpi:story_views':        'story_metric_daily.views_sum',
  'rkpi:story_reach':        'story_metric_daily.reach_sum',
  'rkpi:clicks':             'derived.website_clicks',
  'rkpi:total_interactions': 'derived.total_interactions_profile',
  'rkpi:watch_time':         'post_metric.avg_watch_time',

  /* ── Report: story & sentiment ── */
  story_reach: 'story_metric_daily.reach_sum',
  story_views: 'story_metric_daily.views_sum',
  positive:    'comment_sentiment.positive_count',
  neutral:     'comment_sentiment.neutral_count',
  negative:    'comment_sentiment.negative_count',
}

/** Report columns prefixed `avg_` share their base metric's meaning. */
const AVG_PREFIX = 'avg_'

function resolve(key: string): MetricEntry | undefined {
  return METRIC_GLOSSARY[key] ?? METRIC_GLOSSARY[METRIC_ALIASES[key]]
}

/** Collapse a bilingual entry down to the one language being read. */
function pick(entry: MetricEntry, lang: Lang): ResolvedMetric {
  return lang === 'id'
    ? { label: entry.label, description: entry.description, caveat: entry.caveat }
    : { label: entry.labelEn, description: entry.descriptionEn, caveat: entry.caveatEn }
}

/**
 * Resolve any UI metric key to its glossary entry, in ONE language.
 *
 * `scope` disambiguates ids that exist on more than one surface — pass 'kpi' from
 * dashboard KPI cards. Returns undefined when the key has no entry, in which case
 * callers render no icon at all.
 */
export function lookupMetric(
  key: string | null | undefined,
  scope?: string,
  lang: Lang = DEFAULT_LANG,
): ResolvedMetric | undefined {
  if (!key) return undefined

  const direct = (scope && resolve(`${scope}:${key}`)) || resolve(key)
  if (direct) return pick(direct, lang)

  // `avg_likes` → `likes`, described as the per-post average of that metric.
  if (key.startsWith(AVG_PREFIX)) {
    const base = lookupMetric(key.slice(AVG_PREFIX.length), scope, lang)
    if (base) {
      return lang === 'id'
        ? {
            label: `Rata-rata ${base.label}`,
            description: `${base.description} Ditampilkan sebagai rata-rata per konten pada periode terpilih.`,
            caveat: base.caveat,
          }
        : {
            label: `Average ${base.label}`,
            description: `${base.description} Shown as the per-post average over the selected period.`,
            caveat: base.caveat,
          }
    }
  }

  return undefined
}
