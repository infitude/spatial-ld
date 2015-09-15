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
        wstream.write("@prefix ld: <http://" + layer.name + ".linked-data.io#> .\n");
        wstream.write("@prefix owl: <http://www.w3.org/2002/07/owl#> .\n");
        wstream.write("@prefix sf: <http://www.opengis.net/ont/sf#> .\n");
        wstream.write("@prefix geo: <http://www.opengis.net/ont/geosparql#> .\n");
        wstream.write("@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n");
        wstream.write("@prefix xml: <http://www.w3.org/XML/1998/namespace> .\n");
        wstream.write("@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n");
        wstream.write("@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n");
        wstream.write("@base @base <http://" + layer.name + ".linked-data.io> . .\n");
        
        wstream.write("<http://" + layer.name + ".linked-data.io> rdf:type owl:Ontology .");
        
        // write annotation properties 
        wstream.write("geo:hasGeometry rdf:type owl:AnnotationProperty .\n");
        wstream.write("geo:asWKT rdf:type owl:AnnotationProperty .\n");
        
        layer.fields.forEach(function(f) {
            wstream.write(['ld:' + f.name, 'rdf:type', 'owl:AnnotationProperty', '. \n' ].join(' '));
        });
        
        // write datatypes
        wstream.write("geo:wktLiteral rdf:type rdfs:Datatype .\n");
        
        // write classes
        wstream.write(['ld:' + layer.name, 'rdf:type', 'owl:Class', ';\n'].join(' '));        
        wstream.write('rdfs:subClassOf geo:Feature . \n');        
        wstream.write('geo:Feature rdf:type owl:Class . \n');        
        wstream.write('sf:LineString rdf:type owl:Class . \n');        
        wstream.write('sf:Point rdf:type owl:Class . \n');        
        wstream.write('sf:Polygon rdf:type owl:Class . \n');                
        
        // execute query        
        var queryResultsLayer = dataset.executeSQL(select);

        // write individuals
        queryResultsLayer.features.forEach(function(feature) {

            // write feature
            var featureSubject = 'ld:' + feature.fields.get(0);            
            wstream.write(["<http://" + layer.name + ".linked-data.io#" + feature.fields.get(0) + ">", 'rdf:type', 'ld:' + layer.name, ', owl:NamedIndividual' ].join(' '));
    
            // write attributes
            feature.fields.forEach(function(value, key) {
                wstream.write(' ;\n');
                var triple = { subject: featureSubject, 
                               predicate: 'ld:' + key, 
//                               object: N3Util.createLiteral( value ) };
                               object: ['"', value, '"' ].join('')  };
                wstream.write([' ', triple.predicate, triple.object].join(' '));
            });

            // write geometry
            wstream.write(';\n  geo:hasGeometry ' + "<http://" + layer.name + ".linked-data.io#" + feature.fields.get(0) + "Geom>" + ' .\n');     
            var wkt = feature.getGeometry().toWKT();
            var wkt_dp = wkt.replace(/([0-9]+\.[0-9]{5})([0-9]+)/g, '$1');      // truncate decimal places in coordinates 
            wstream.write("<http://" + layer.name + ".linked-data.io#" + feature.fields.get(0) + "Geom>" + ' rdf:type sf:Polygon , owl:NamedIndividual ; \n');                
            var spatialTriple = { subject: featureSubject, 
                                  predicate: 'geo:asWKT', 
                                  //object: '"' + wkt_dp + '"^^geo:wktLiteral'  };
                                  object: '"' + wkt_dp + '"'  };
            wstream.write([' ', spatialTriple.predicate, spatialTriple.object, ' . \n'].join(' '));
        });
        wstream.end();
    }
}