import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${s}.${centis.toString().padStart(2, '0')}s`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tokenId: string }> }) {
  try {
    const resolvedParams = await params;
    const tokenId = parseInt(resolvedParams.tokenId, 10);
    if (isNaN(tokenId)) {
      return NextResponse.json({ error: 'Invalid token ID' }, { status: 400 });
    }

    // Fetch the run data from Supabase
    const { data, error } = await supabase
      .from('ham_runs')
      .select('*')
      .eq('token_id', tokenId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    // Clean up the SVG
    let svgContent = data.path_svg || '';
    if (!svgContent.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgContent = svgContent.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    }

    // Convert SVG to Base64 data URI
    const base64Svg = Buffer.from(svgContent).toString('base64');
    const imageUri = `data:image/svg+xml;base64,${base64Svg}`;

    // Construct the standard SIP-009 / ERC-721 JSON metadata
    const metadata = {
      sip: 16,
      name: `HAM Maze Run #${tokenId}`,
      description: `An official speedrun of HAM Maze #${data.maze_id}. Navigate the path as fast as possible without touching the walls.`,
      image: imageUri,
      attributes: [
        { trait_type: "Maze ID", value: data.maze_id.toString() },
        { trait_type: "Network", value: data.network },
        { trait_type: "Time (ms)", value: data.time_ms, display_type: "number" },
        { trait_type: "Formatted Time", value: formatTime(data.time_ms) },
        { trait_type: "Attempts", value: data.attempts || 1, display_type: "number" }
      ]
    };

    return NextResponse.json(metadata);
  } catch (err) {
    console.error('[metadata api]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
