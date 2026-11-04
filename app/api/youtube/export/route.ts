import { NextResponse } from "next/server";
import { requireAdmin, channelAccessToken, ytFetch } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Admin-only download of channel, video and recent comment stats for offline analysis
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const token = await channelAccessToken();
    const ch = await ytFetch(token, "/channels?part=snippet,statistics,contentDetails,brandingSettings&mine=true");
    const channel = ch.items?.[0];
    if (!channel) return NextResponse.json({ error: "No channel" }, { status: 404 });

    const uploads = channel.contentDetails.relatedPlaylists.uploads;
    const ids: string[] = [];
    let page = "";
    while (ids.length < 1000) {
      const pl = await ytFetch(token, `/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}${page ? `&pageToken=${page}` : ""}`);
      ids.push(...(pl.items ?? []).map((i: any) => i.contentDetails.videoId));
      if (!pl.nextPageToken) break;
      page = pl.nextPageToken;
    }

    const videos: any[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const v = await ytFetch(token, `/videos?part=snippet,contentDetails,statistics&id=${ids.slice(i, i + 50).join(",")}`);
      for (const x of v.items ?? []) {
        videos.push({
          id: x.id,
          title: x.snippet.title,
          description: (x.snippet.description ?? "").slice(0, 300),
          tags: x.snippet.tags ?? [],
          published_at: x.snippet.publishedAt,
          duration: x.contentDetails.duration,
          live: x.snippet.liveBroadcastContent,
          stats: x.statistics,
        });
      }
    }

    const comments: any[] = [];
    page = "";
    while (comments.length < 500) {
      const c = await ytFetch(token, `/commentThreads?part=snippet&allThreadsRelatedToChannelId=${channel.id}&maxResults=100&order=time&textFormat=plainText${page ? `&pageToken=${page}` : ""}`);
      for (const t of c.items ?? []) {
        const s = t.snippet.topLevelComment.snippet;
        comments.push({ video_id: t.snippet.videoId, text: s.textDisplay, likes: s.likeCount, replies: t.snippet.totalReplyCount, published_at: s.publishedAt, by_channel: s.authorChannelId?.value === channel.id });
      }
      if (!c.nextPageToken) break;
      page = c.nextPageToken;
    }

    const body = JSON.stringify({
      exported_at: new Date().toISOString(),
      channel: { id: channel.id, title: channel.snippet.title, description: channel.snippet.description, created_at: channel.snippet.publishedAt, country: channel.snippet.country, keywords: channel.brandingSettings?.channel?.keywords, stats: channel.statistics },
      videos,
      comments,
    });
    return new NextResponse(body, {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="youtube-stats.json"` },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "failed" }, { status: 500 });
  }
}
