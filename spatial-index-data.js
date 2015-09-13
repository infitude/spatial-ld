#!/usr/bin/env node

var gdal = require('gdal'),
    fs = require('fs'),
    program = require('commander'),
    N3 = require('n3'),
    N3Util = require('n3').Util;

var NS_GEOSPARQL = 'http://www.opengis.net/ont/geosparql#';

program
    .version('0.0.1')
//    .usage('[options] <shapefile>')
    .usage('[options]')
    .option('-o, --output [filename]', 'file name', 'output.ttl')
    .option('-i, --info', 'display shapefile infomation')
    .option('-n, --index [column]', 'create a non-spatial index on the column specified')

program.on('--help', function(){
        console.log("gdal version: " + gdal.version);
//        gdal.drivers.forEach(function(driver) {
//          console.log("gdal driver: " + driver.description);
//        });    
})

program.parse(process.argv);

if(!program.args.length) {
    program.help();
} else {
    var shapefile = '' + program.args;

    if(program.output) {
        console.log( 'output:' + program.output);
    }

    var dataset = gdal.open(shapefile);
    var layer = dataset.layers.get(0);

    if(program.info) {
        console.log("file name: " + shapefile);
        console.log("layer name: " + layer.name);
        console.log("number of features: " + layer.features.count());
        console.log("fields: " + layer.fields.getNames());
        console.log("extent: " + JSON.stringify(layer.extent));
        console.log("srs: " + (layer.srs ? layer.srs.toWKT() : 'null'));           
    } else if(program.index) {
        var index = ['CREATE INDEX ON', layer.name, 'USING', program.index].join(' ');
        //dataset.executeSQL(index);
        console.log(index);
    }
    else {
        
        var select = "select * from " + layer.name;

        var wstream = fs.createWriteStream(program.output);

        // write namespaces
//        wstream.write("@prefix ld: <http://" + layer.name + ".linked-data.io#> .\n");
//        wstream.write("@prefix geo: <http://www.opengis.net/ont/geosparql#> .\n");
        var ns = 'http://' + layer.name + '.linked-data.io#';
        var geo = 'http://www.opengis.net/ont/geosparql#';

        // execute query        
        var queryResultsLayer = dataset.executeSQL(select);

        wstream.write('[');
        // write individuals
        queryResultsLayer.features.forEach(function(feature) {

            // create json record
            var jsonSubject = ns + feature.fields.get(0);            
            var jsonPredicate = geo + 'hasGeometry';
            var jsonObject = ns + feature.fields.get(0) + 'Geom';

            // get geometry
            var wkt = feature.getGeometry().toWKT();
            var wkt_dp = wkt.replace(/([0-9]+\.[0-9]{5})([0-9]+)/g, '$1');      // truncate decimal places in coordinates 

            var spatialJSON = { subject: jsonSubject, 
                                  predicate: jsonPredicate,
                                  object: jsonObject, 
                                  geometry: wkt_dp };
            wstream.write([JSON.stringify(spatialJSON), ','].join(''));
        });
        wstream.write('{}]');
        wstream.end();
    }
}