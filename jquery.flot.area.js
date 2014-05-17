/* Flot plugin for display data inside/outside area.

Copyright (c) 2014 Jakub Kahoun.
Licensed under the MIT license.

The plugin supports these options:

	series : {
                area: {
                    areas: [
                        {
                            areaPoints: […],						//{x: 5, y: 0}, {x: 15, y: -5}, {x: 20, y: 15}, {x: 10, y: 15}
                            color: AreaLineColor
                            fillColor: AreaFillColor
                        }
                    ], 
                    outsideColor: OutSideAreaColor
                    drawLastPts: boolean					// If you want to see which direction series goes
                },
                points: {
                    show: false
                },
                lines: {
                    show: true
                }
            }

An array can be passed for multiple areas, like this:

	areas: [{
		…
	},{
		…
	}]

Internally, the plugin works by splitting the data into two series, inside and outside series.
*/

((function ($) {
    var options = {
        series: {
            area: null
        }
    };

    function init(plot) {
        function isPointInPoly(poly, pt) {
            for(var c = false, i = -1, l = poly.length, j = l - 1; ++i < l; j = i)
                ((poly[i].y <= pt.y && pt.y < poly[j].y) || (poly[j].y <= pt.y && pt.y < poly[i].y))
                && (pt.x < (poly[j].x - poly[i].x) * (pt.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x)
                && (c = !c);
            return c;
        }
        
        function getLineIntersection(p0, p1, p2, p3) {        
            var s1_x, s1_y, s2_x, s2_y;
            s1_x = p1.x - p0.x;     s1_y = p1.y - p0.y;
            s2_x = p3.x - p2.x;     s2_y = p3.y - p2.y;

            var s = (-s1_y * (p0.x - p2.x) + s1_x * (p0.y - p2.y)) / (-s2_x * s1_y + s1_x * s2_y);
            var t = ( s2_x * (p0.y - p2.y) - s2_y * (p0.x - p2.x)) / (-s2_x * s1_y + s1_x * s2_y);

            if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
                var inter = new Object();
                inter.x = p0.x + (t * s1_x);
                inter.y = p0.y + (t * s1_y);
                return inter;
            }
            return false;
        }
        
        function areaData(plot, s, datapoints, areaPoints, outsideColor) {
            var ps = datapoints.pointsize,
                i, p, prevp, middleP,
                area = $.extend({}, s); // note: shallow copy

            area.datapoints = {
                points: [],
                pointsize: ps,
                format: datapoints.format
            };
            area.areaPoints = areaPoints;
            area.area = null;
            area.label = null;
            area.color = s.color;
            area.originSeries = s;
            area.data = [];
            
            s.color = outsideColor;

            var origpoints = datapoints.points,
                addCrossingPoints = s.lines.show;

            var areapoints = [];
            var newpoints = [];
            var m;

            for (i = 0; i < origpoints.length; i += ps) {
                var pt = new Object();
                pt.x = origpoints[i];
                pt.y = origpoints[i + 1];
                
                if(i >= ps) {
                    var prevPt = new Object();
                    prevPt.x = origpoints[i - 2];
                    prevPt.y = origpoints[i - 1];
                }
                
                prevp = p;
                
                if (isPointInPoly(area.areaPoints, pt)) {
                    p = areapoints;
                } else {
                    p = newpoints;
                }
                // Add crossing point
                if(addCrossingPoints && pt.x != null && i > 0 && origpoints[i - ps] != null) {
                    var interArray = [];
                    // Find all inter points
                    for(var polIndex = 0; polIndex < area.areaPoints.length; polIndex++) {
                        var inter = getLineIntersection(prevPt, pt, area.areaPoints[polIndex % area.areaPoints.length], area.areaPoints[(polIndex+1) % area.areaPoints.length]);
                        if(inter) {
                            interArray.push(inter);
                        }
                    }
                    
                    // sort array
                    countDistanceFromReference(interArray, prevPt);
                    interArray.sort(compareDistance);
                    
                    prevInterPt = prevPt;
                    
                    $.each(interArray, function( index, inter) {
                        var middlePt = getMiddlePoint(prevInterPt, inter);
                        prevInterPt = inter;
                        if (isPointInPoly(area.areaPoints, middlePt)) {
                            var prep = areapoints;
                            var actp = newpoints;
                        } else {
                            var prep = newpoints;
                            var actp = areapoints;
                        }
                        
                        prep.push(inter.x);
                        prep.push(inter.y);
            
                        actp.push(null);
                        actp.push(null);
            
                        actp.push(inter.x);
                        actp.push(inter.y);
                        
                    });
                }
                
                p.push(pt.x);
                p.push(pt.y);
            }
            
            datapoints.points = newpoints;
            area.datapoints.points = areapoints;
            
            if (area.datapoints.points.length > 0) {
                var origIndex = $.inArray(s, plot.getData());
                plot.getData().splice(origIndex + 1, 0, area);
            }
        }
        
        function countDistanceFromReference(array, refPt) {
            for(var i = 0; i < array.length; i++) {
                var distance = countDistance(array[i], refPt);
                array[i].distance = distance;
            }
        }
        // Function to sort array by distance
        function compareDistance(a,b) {
            if (a.distance < b.distance)
                return -1;
            if (a.distance > b.distance)
                return 1;
            return 0;
        }
        // Count distance between two points
        function countDistance(pt, refPt) {
            return Math.sqrt(Math.pow(pt.x - refPt.x, 2) + Math.pow(pt.y - refPt.y, 2));
        }
        // Get point in middle of these two points
        function getMiddlePoint(prevPt, pt) {
            var newPt = new Object();
            newPt.x = (prevPt.x + pt.x) / 2;
            newPt.y = (prevPt.y + pt.y) / 2;
            return newPt;
        }
        // Draw circle over last points of each series
        function circle(ctx, x, y, radius, color) {
            ctx.beginPath();
            ctx.strokeStyle = "rgb(0,0,0)";
            ctx.fillStyle = color;
            ctx.arc(x, y, radius, 0, 2*Math.PI);
            ctx.stroke();
            ctx.fill();
            ctx.closePath();
        }
        
        function decideDrawing(plot, s) {
            if(plot.area == undefined) {
                return;
            }
            // Draw each area
            $(plot.area.areas).each(function (i, ar) {
                drawArea(plot, ar);
            });
            // Draw last point of series more marked
            if(plot.area.drawLastPts) {
                drawLastPoints(plot, plot.area.seriesLastPoints);
            }
        }
        
        function transformAreaPointsToPixels(areaPoints) {
            var newPoints = [];
            var axes = plot.getAxes();
            var offset = plot.getPlotOffset();
            for (i = 0; i < areaPoints.length; i++) {
                var newPt = new Object();
                newPt.x = axes.xaxis.p2c(areaPoints[i].x) + offset.left;
                newPt.y = axes.yaxis.p2c(areaPoints[i].y) + offset.top;
                newPoints.push(newPt);
            }
            return newPoints;
        }
        
        function drawArea(plot, area) {
            var color = area.color;
            var fillColor = area.fillColor;
            var areaPoints = transformAreaPointsToPixels(area.areaPoints);
            var canvas = plot.getCanvas(); 
            var ctx = canvas.getContext('2d');
            
            ctx.beginPath();
            
            ctx.strokeStyle = color;
            ctx.fillStyle = fillColor;

            ctx.moveTo(areaPoints[0].x, areaPoints[0].y);
            for (i = 1; i < areaPoints.length; i++) {
                ctx.lineTo(areaPoints[i].x, areaPoints[i].y);
            }

            ctx.closePath();
            ctx.stroke();
            ctx.fill();            
        }
        
        function drawLastPoints(plot, seriesLastPoints) {
            var canvas = plot.getCanvas(); 
            var ctx = canvas.getContext('2d');
            
            if(seriesLastPoints.length > 0) {
                var lps = transformAreaPointsToPixels(seriesLastPoints);
                $(lps).each(function (i, lp) {
                    circle(ctx, lp.x, lp.y, 8, lp.color);
                });
            }
        }
        // Decide if the area polygon is correctly defined
        function correctSetup(plot, area) {
            if (area.areaPoints.length < 3) {
                return false;
            }
            
            $(area.areaPoints).each(function (i, pt) {
                if(pt.x == undefined || pt.y == undefined) {
                    return false;
                }
            });
            
            if (area.color == null) {
                 area.color = green;   
            }
            
            if (area.fillColor == null) {
                 area.fillColor = 'rgba(10, 200, 10, 0.2)';   
            }
            
            return true;
        }

        function createNewLastPoint(x, y, color) {
            var lastPoint = new Object();
            lastPoint.x = x;
            lastPoint.y = y;
            lastPoint.color = color;
            return lastPoint;
        }
        
        function processArea(plot, s, datapoints) {
            if (!s.area) return;
            // Copy area object to plot.
            if (plot.area == undefined) {
                plot.area = new Object();
                plot.area.areas = [];
                plot.area.drawLastPts = s.area.drawLastPts;
                // Control each area, if is ok add it
                $(s.area.areas).each(function (i, ar) {
                    if(correctSetup(plot, ar)) {
                         plot.area.areas.push(ar);
                     }
                });
                plot.area.seriesLastPoints = [];
                plot.area.outsideColor = s.area.outsideColor;
            }

            $(plot.area.areas).each(function (i, ar) {
                areaData(plot, s, datapoints, ar.areaPoints, plot.area.outsideColor);
            });
            
            var lp = createNewLastPoint(datapoints.points[datapoints.points.length - 2], datapoints.points[datapoints.points.length - 1], s.color);
            plot.area.seriesLastPoints.push(lp);
        }
        
        plot.hooks.draw.push(decideDrawing);
        plot.hooks.processDatapoints.push(processArea);
    }
    
    
    $.plot.plugins.push({
        init: init,
        options: options,
        name: 'area',
        version: '0.1'
    });
})(jQuery);