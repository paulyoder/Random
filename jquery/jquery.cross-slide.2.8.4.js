/*
 * Copyright 2007 by Tobia Conforto <tobia.conforto@linux.it>
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of the GNU General
 * Public License as published by the Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program; if not, write to
 * the Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 *
 * Versions: 0.1    2007-08-19  Initial release
 *                  2008-08-21  Re-released under GPL v2
 *           0.1.1  2008-09-18  Compatibility with prototype.js
 */

jQuery.fn.crossSlide = function(opts, plan) {
	var self = this,
			self_width = this.width(),
			self_height = this.height();

	// generic utilities
	function format(str) {
		for (var i = 1; i < arguments.length; i++)
			str = str.replace(new RegExp('\\{' + (i-1) + '}', 'g'), arguments[i]);
		return str;
	}

	function dump_obj(o) {
		var s = '{ ';
		for (var n in o)
			s += n + ': ' + o[n] + ', ';
		return (s == '{ ' ? '{}' : s.slice(0, -2) + ' }');
	}

	// first preload all the images, while getting their actual width and height
	(function(proceed) {

		var n_loaded = 0;
		function loop(i, img) {
			// for (i = 0; i < plan.length; i++) but with independent var i, img (for the closures)
			img.onload = function(e) {
				n_loaded++;
				plan[i].width = img.width;
				plan[i].height = img.height;
				if (n_loaded == plan.length)
					proceed();
			}
			img.src = plan[i].src;
			if (i + 1 < plan.length)
				loop(i + 1, new Image());
		}
		loop(0, new Image());

	})(function() {  // then proceed

		// utility to parse "from" and "to" parameters
		function parse_position_param(param) {
			var zoom = 1;
			var tokens = param.replace(/^\s*|\s*$/g, '').split(/\s+/);
			if (tokens.length > 3) throw new Error();
			if (tokens[0] == 'center')
				if (tokens.length == 1)
					tokens = ['center', 'center'];
				else if (tokens.length == 2 && tokens[1].match(/^[\d.]+x$/i))
					tokens = ['center', 'center', tokens[1]];
			if (tokens.length == 3)
				zoom = parseFloat(tokens[2].match(/^([\d.]+)x$/i)[1]);
			var pos = tokens[0] + ' ' + tokens[1];
			if (pos == 'left top'      || pos == 'top left')      return { xrel:  0, yrel:  0, zoom: zoom };
			if (pos == 'left center'   || pos == 'center left')   return { xrel:  0, yrel: .5, zoom: zoom };
			if (pos == 'left bottom'   || pos == 'bottom left')   return { xrel:  0, yrel:  1, zoom: zoom };
			if (pos == 'center top'    || pos == 'top center')    return { xrel: .5, yrel:  0, zoom: zoom };
			if (pos == 'center center')                           return { xrel: .5, yrel: .5, zoom: zoom };
			if (pos == 'center bottom' || pos == 'bottom center') return { xrel: .5, yrel:  1, zoom: zoom };
			if (pos == 'right top'     || pos == 'top right')     return { xrel:  1, yrel:  0, zoom: zoom };
			if (pos == 'right center'  || pos == 'center right')  return { xrel:  1, yrel: .5, zoom: zoom };
			if (pos == 'right bottom'  || pos == 'bottom right')  return { xrel:  1, yrel:  1, zoom: zoom };
			return {
				xrel: parseInt(tokens[0].match(/^(\d+)%$/)[1]) / 100,
				yrel: parseInt(tokens[1].match(/^(\d+)%$/)[1]) / 100,
				zoom: zoom
			};
		}

		// utility to compute the css for a given phase between p.from and p.to
		// phase = 1: begin fade-in,  2: end fade-in,  3: begin fade-out,  4: end fade-out
		function position_to_css(p, phase) {
			switch (phase) {
				case 1:
					var pos = 0;
					break;
				case 2:
					var pos = fade_ms / (p.time_ms + 2 * fade_ms);
					break;
				case 3:
					var pos = 1 - fade_ms / (p.time_ms + 2 * fade_ms);
					break;
				case 4:
					var pos = 1;
					break;
			}
			return {
				left:   Math.round(p.from.left   + pos * (p.to.left   - p.from.left  )),
				top:    Math.round(p.from.top    + pos * (p.to.top    - p.from.top   )),
				width:  Math.round(p.from.width  + pos * (p.to.width  - p.from.width )),
				height: Math.round(p.from.height + pos * (p.to.height - p.from.height))
			};
		}

		// check global params
		if (! opts.fade)
			throw 'Missing fade parameter.';
		if (opts.speed && opts.sleep)
			throw 'You cannot set both speed and sleep at the same time.';
		// conversion from sec to ms; from px/sec to px/ms
		var fade_ms = Math.round(opts.fade * 1000);
		if (opts.sleep)
			var sleep = Math.round(opts.sleep * 1000);
		if (opts.speed)
			var speed = opts.speed / 1000,
					fade_px = Math.round(fade_ms * speed);

		// a debug: true option may be added to get a dump of the generated JavaScript code
		if (opts.debug)
			var debug = jQuery('<pre><hr/></pre>');

		// set container css
		self.empty().css({
			overflow: 'hidden',
			padding: 0
		});
		if (! self.css('position').match(/absolute|relative|fixed/))
			self.css({ position: 'relative' })

		// prepare each image
		for (var i = 0; i < plan.length; ++i) {

			var p = plan[i];
			if (! p.src)
				throw format('Missing src parameter in picture {0}.', i + 1);

			if (speed) { // speed/dir mode

				// check parameters and translate speed/dir mode into full mode (from/to/time)
				switch (p.dir) {
					case 'up':
						p.from = { xrel: .5, yrel: 0, zoom: 1 };
						p.to   = { xrel: .5, yrel: 1, zoom: 1 };
						var slide_px = p.height - self_height - 2 * fade_px;
						break;
					case 'down':
						p.from = { xrel: .5, yrel: 1, zoom: 1 };
						p.to   = { xrel: .5, yrel: 0, zoom: 1 };
						var slide_px = p.height - self_height - 2 * fade_px;
						break;
					case 'left':
						p.from = { xrel: 0, yrel: .5, zoom: 1 };
						p.to   = { xrel: 1, yrel: .5, zoom: 1 };
						var slide_px = p.width - self_width - 2 * fade_px;
						break;
					case 'right':
						p.from = { xrel: 1, yrel: .5, zoom: 1 };
						p.to   = { xrel: 0, yrel: .5, zoom: 1 };
						var slide_px = p.width - self_width - 2 * fade_px;
						break;
					default:
						throw format('Missing or malformed "dir" parameter in picture {0}.', i + 1);
				}
				if (slide_px <= 0)
					throw format('Picture number {0} is too short for the desired fade duration.', i + 1);
				p.time_ms = Math.round(slide_px / speed);

			} else if (! sleep) { // full mode

				// check and parse parameters
				if (! p.from || ! p.to || ! p.time)
					throw format('Missing either speed/sleep option, or from/to/time params in picture {0}.', i + 1);
				try {
					p.from = parse_position_param(p.from)
				} catch (e) {
					throw format('Malformed "from" parameter in picture {0}.', i + 1);
				}
				try {
					p.to = parse_position_param(p.to)
				} catch (e) {
					throw format('Malformed "to" parameter in picture {0}.', i + 1);
				}
				if (! p.time)
					throw format('Missing "time" parameter in picture {0}.', i + 1);
				p.time_ms = Math.round(p.time * 1000)
			}

			// precalculate left/top/width/height bounding values
			if (p.from)
				jQuery.each([ p.from, p.to ], function(i, from_to) {
					from_to.width  = Math.round(p.width  * from_to.zoom);
					from_to.height = Math.round(p.height * from_to.zoom);
					from_to.left   = Math.round((self_width  - from_to.width)  * from_to.xrel);
					from_to.top    = Math.round((self_height - from_to.height) * from_to.yrel);
				});

			// append the image element to the container
			jQuery(format('<img src="{0}"/>', p.src)).appendTo(self).css({
				position: 'absolute',
				visibility: 'hidden'
			});
		}
		speed = undefined;  // speed mode has now been translated to full mode

		var imgs = self.children();

		// show first image
		imgs.eq(0).css({ visibility: 'visible' });
		if (! sleep)
			imgs.eq(0).css(position_to_css(plan[0], 2));

		// create animation chain
		function create_chain(i, chainf) {
			// building the chain backwards, or inside out

			if (i % 2 == 0) {
				if (sleep) {

					// still image sleep

					var i_sleep = i / 2,
							i_hide = (i_sleep - 1 + plan.length) % plan.length,
							img_sleep = imgs.eq(i_sleep),
							img_hide = imgs.eq(i_hide);

					var newf = function() {
						img_hide.css('visibility', 'hidden');
						setTimeout(chainf, sleep);
					};

					if (debug)
						debug.prepend('<hr/>'
							+ format("img[{0}].css(visibility, hidden)\n", i_hide)
							+ format("setTimeout(&#9660;, {0})", sleep));

				} else {

					// single image slide

					var i_slide = i / 2,
							i_hide = (i_slide - 1 + plan.length) % plan.length,
							img_slide = imgs.eq(i_slide),
							img_hide = imgs.eq(i_hide),
							time = plan[i_slide].time_ms,
							slide_anim = position_to_css(plan[i_slide], 3);

					var newf = function() {
						img_hide.css('visibility', 'hidden');
						img_slide.animate(slide_anim, time, 'linear', chainf);
					};

					if (debug)
						debug.prepend('<hr/>'
							+ format("img[{0}].css(visibility, hidden)\n", i_hide)
							+ format("img[{0}].animate({1}, {2}, linear, &#9660;)", i_slide, dump_obj(slide_anim), time));

				}
			} else {
				if (sleep) {

					// still image cross-fade

					var i_from = Math.floor(i / 2),
							i_to = Math.ceil(i / 2) % plan.length,
							img_from = imgs.eq(i_from),
							img_to = imgs.eq(i_to),
							from_anim = {},
							to_init = { visibility: 'visible' },
							to_anim = {};

					if (i_to > i_from) {
						to_init.opacity = 0;
						to_anim.opacity = 1;
					} else {
						from_anim.opacity = 0;
					}

					var newf = function() {
						img_to.css(to_init);
						if (from_anim.opacity != undefined)
							img_from.animate(from_anim, fade_ms, 'linear', chainf);
						else
							img_to.animate(to_anim, fade_ms, 'linear', chainf);
					};

					if (debug)
						debug.prepend('<hr/>'
							+ format("img[{0}].css({1})\n", i_to, dump_obj(to_init))
							+ (from_anim.opacity != undefined
								? format("img[{0}].animate({1}, {2}, linear, &#9660;)", i_from, dump_obj(from_anim), fade_ms)
								: format("img[{0}].animate({1}, {2}, linear, &#9660;)", i_to, dump_obj(to_anim), fade_ms)));

				} else {

					// cross-slide + cross-fade

					var i_from = Math.floor(i / 2),
							i_to = Math.ceil(i / 2) % plan.length,
							img_from = imgs.eq(i_from),
							img_to = imgs.eq(i_to),
							from_anim = position_to_css(plan[i_from], 4),
							to_init = position_to_css(plan[i_to], 1),
							to_anim = position_to_css(plan[i_to], 2);

					if (i_to > i_from) {
						to_init.opacity = 0;
						to_anim.opacity = 1;
					} else {
						from_anim.opacity = 0;
					}
					to_init.visibility = 'visible';

					var newf = function() {
						img_from.animate(from_anim, fade_ms, 'linear');
						img_to.css(to_init);
						img_to.animate(to_anim, fade_ms, 'linear', chainf);
					};

					if (debug)
						debug.prepend('<hr/>'
							+ format("img[{0}].animate({1}, {2}, linear)\n", i_from, dump_obj(from_anim), fade_ms)
							+ format("img[{0}].css({1})\n", i_to, dump_obj(to_init))
							+ format("img[{0}].animate({1}, {2}, linear, &#9660;)", i_to, dump_obj(to_anim), fade_ms));

				}
			}
			if (i > 0)
				return create_chain(i - 1, newf);
			else
				return newf;
		}
		var animation = create_chain(plan.length * 2 - 1, function() { return animation(); });

		// show debug window, if enabled
		if (debug)
			jQuery(window.open('', 'debug', 'width=600,height=500,menubar=no,toolbar=no,directories=no,'
					+ 'location=no,status=no,scrollbars=yes,resizable=yes').document.body)
				.empty()
				.append(debug);

		// start animation
		animation();

	});

	return self;
};
