import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Facebook, Instagram, Linkedin } from "lucide-react";
import { useLang } from "@/lib/language";
import { fetchSocialPosts, type SocialPostRecord, type SocialPlatform } from "@/lib/api";

const platformMeta: Record<SocialPlatform, { icon: typeof Facebook; color: string }> = {
  facebook: { icon: Facebook, color: "text-blue-600" },
  instagram: { icon: Instagram, color: "text-pink-600" },
  linkedin: { icon: Linkedin, color: "text-sky-700" },
};

export default function Updates() {
  const { t, lang } = useLang();
  const u = t.updates;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [posts, setPosts] = useState<SocialPostRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchSocialPosts()
      .then((p) => setPosts(p.slice(0, 6)))
      .catch(() => setPosts([]))
      .finally(() => setLoaded(true));
  }, []);

  if (loaded && posts.length === 0) return null;

  const Arrow = t.dir === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <section className="py-20 bg-gray-50 dark:bg-background" dir={t.dir}>
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <div className="inline-block px-4 py-1.5 bg-primary/10 text-primary rounded-full font-semibold text-sm mb-4">
            {u.badge}
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-3">{u.title}</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{u.body}</p>
          <div className="w-20 h-1.5 bg-primary rounded-full mx-auto mt-4"></div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => {
            const caption = lang === "ar" ? (post.captionAr || post.captionEn) : (post.captionEn || post.captionAr);
            const meta = platformMeta[post.platform];
            const Icon = meta.icon;
            return (
              <article key={post.id} className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col">
                {post.image && (
                  <div className="h-44 overflow-hidden bg-gray-100">
                    <img src={post.image} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                  </div>
                )}
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center ${meta.color}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    {post.releasedAt && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(post.releasedAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { year: "numeric", month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                  <p className="text-foreground/80 text-sm leading-relaxed whitespace-pre-wrap line-clamp-5 flex-1">{caption}</p>
                  {post.link && (
                    <Link href={`${base}/articles/${post.link}`} className="inline-flex items-center gap-1.5 text-primary font-semibold text-sm mt-4 hover:gap-2.5 transition-all">
                      {u.readArticle}
                      <Arrow className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
