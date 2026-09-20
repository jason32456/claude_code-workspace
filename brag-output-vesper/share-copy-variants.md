# Share copy variants — Vesper

Canonical caption is `share-copy.txt`. These are platform cuts.

## X / Twitter (short)
Most games give you an avatar and a health bar. Vesper gives you 1,800 starlings and the
number of them still alive.

You steer the murmuration, not a bird. Density is your armour.

## X / Twitter (one-liner)
Made a game where there is no player object — you steer a murmuration of 1,800 simulated
starlings, and the birds still alive are the health bar.

## LinkedIn / longer
Vesper is a browser game built on one substitution: delete the avatar and the health bar,
and make the flock itself both.

Three things fall out of it. Birds are the only resource, so falcons, transmission wires
and the dark all cost you the same currency. Defence becomes a shape rather than a button —
a peregrine's strike success collapses as local prey density rises, the real confusion
effect, so crowding tight is armour that costs you speed and stamina. And the counter to a
committed dive is flash expansion: blow your own murmuration apart in the last half second
and the falcon closes on air.

Up to ~1,800 boids in flat Float32Arrays over a hashed uniform grid, ~2 ms a step for a
thousand birds, zero per-frame allocation. No build step and no asset files — terrain,
birds, sky, water and every sound are generated at load.

## Discord / short + blunt
there's no player object in this game
you ARE the flock, and the birds still alive are the health bar
crowd tight so the falcon misses
