export interface CommonOntology {
  id: string;
  name: string;
  description: string;
  prefix: string;
  baseUri: string;
  turtle: string;
}

export const COMMON_ONTOLOGIES: CommonOntology[] = [
  {
    id: "skos",
    name: "SKOS Core",
    description: "Simple Knowledge Organization System — concepts, schemes, hierarchies, labels",
    prefix: "skos",
    baseUri: "http://www.w3.org/2004/02/skos/core#",
    turtle: `@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<http://www.w3.org/2004/02/skos/core> a owl:Ontology ;
  rdfs:label "SKOS Core Vocabulary" .

skos:Concept a owl:Class ;
  rdfs:label "Concept" ;
  rdfs:comment "An idea or notion; a unit of thought." .

skos:ConceptScheme a owl:Class ;
  rdfs:label "Concept Scheme" ;
  rdfs:comment "A set of concepts, optionally including semantic relationships between them." .

skos:Collection a owl:Class ;
  rdfs:label "Collection" ;
  rdfs:comment "A meaningful collection of concepts." .

skos:prefLabel a owl:AnnotationProperty ;
  rdfs:label "preferred label" ;
  rdfs:domain skos:Concept .

skos:altLabel a owl:AnnotationProperty ;
  rdfs:label "alternative label" ;
  rdfs:domain skos:Concept .

skos:hiddenLabel a owl:AnnotationProperty ;
  rdfs:label "hidden label" ;
  rdfs:domain skos:Concept .

skos:definition a owl:AnnotationProperty ;
  rdfs:label "definition" ;
  rdfs:domain skos:Concept .

skos:notation a owl:AnnotationProperty ;
  rdfs:label "notation" ;
  rdfs:domain skos:Concept .

skos:note a owl:AnnotationProperty ;
  rdfs:label "note" ;
  rdfs:domain skos:Concept .

skos:scopeNote a owl:AnnotationProperty ;
  rdfs:label "scope note" ;
  rdfs:domain skos:Concept .

skos:example a owl:AnnotationProperty ;
  rdfs:label "example" ;
  rdfs:domain skos:Concept .

skos:broader a owl:ObjectProperty ;
  rdfs:label "has broader" ;
  rdfs:domain skos:Concept ;
  rdfs:range skos:Concept .

skos:narrower a owl:ObjectProperty ;
  rdfs:label "has narrower" ;
  rdfs:domain skos:Concept ;
  rdfs:range skos:Concept .

skos:related a owl:ObjectProperty ;
  rdfs:label "has related" ;
  rdfs:domain skos:Concept ;
  rdfs:range skos:Concept .

skos:inScheme a owl:ObjectProperty ;
  rdfs:label "is in scheme" ;
  rdfs:domain skos:Concept ;
  rdfs:range skos:ConceptScheme .

skos:hasTopConcept a owl:ObjectProperty ;
  rdfs:label "has top concept" ;
  rdfs:domain skos:ConceptScheme ;
  rdfs:range skos:Concept .

skos:topConceptOf a owl:ObjectProperty ;
  rdfs:label "is top concept of" ;
  rdfs:domain skos:Concept ;
  rdfs:range skos:ConceptScheme .

skos:member a owl:ObjectProperty ;
  rdfs:label "has member" ;
  rdfs:domain skos:Collection ;
  rdfs:range skos:Concept .

skos:exactMatch a owl:ObjectProperty ;
  rdfs:label "exact match" ;
  rdfs:domain skos:Concept ;
  rdfs:range skos:Concept .

skos:closeMatch a owl:ObjectProperty ;
  rdfs:label "close match" ;
  rdfs:domain skos:Concept ;
  rdfs:range skos:Concept .

skos:broadMatch a owl:ObjectProperty ;
  rdfs:label "broad match" ;
  rdfs:domain skos:Concept ;
  rdfs:range skos:Concept .

skos:narrowMatch a owl:ObjectProperty ;
  rdfs:label "narrow match" ;
  rdfs:domain skos:Concept ;
  rdfs:range skos:Concept .

skos:relatedMatch a owl:ObjectProperty ;
  rdfs:label "related match" ;
  rdfs:domain skos:Concept ;
  rdfs:range skos:Concept .
`,
  },
  {
    id: "dcterms",
    name: "Dublin Core Terms",
    description: "dcterms — standard metadata terms for resources: title, creator, date, rights…",
    prefix: "dcterms",
    baseUri: "http://purl.org/dc/terms/",
    turtle: `@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<http://purl.org/dc/terms/> a owl:Ontology ;
  rdfs:label "Dublin Core Metadata Terms" .

dcterms:Agent a owl:Class ;
  rdfs:label "Agent" ;
  rdfs:comment "A resource that acts or has the power to act." .

dcterms:AgentClass a owl:Class ;
  rdfs:label "Agent Class" .

dcterms:BibliographicResource a owl:Class ;
  rdfs:label "Bibliographic Resource" .

dcterms:LicenseDocument a owl:Class ;
  rdfs:label "License Document" .

dcterms:Location a owl:Class ;
  rdfs:label "Location" .

dcterms:MediaType a owl:Class ;
  rdfs:label "Media Type" .

dcterms:title a owl:AnnotationProperty ;
  rdfs:label "title" ;
  rdfs:comment "A name given to the resource." .

dcterms:description a owl:AnnotationProperty ;
  rdfs:label "description" ;
  rdfs:comment "An account of the resource." .

dcterms:identifier a owl:AnnotationProperty ;
  rdfs:label "identifier" ;
  rdfs:comment "An unambiguous reference to the resource." .

dcterms:subject a owl:AnnotationProperty ;
  rdfs:label "subject" .

dcterms:language a owl:AnnotationProperty ;
  rdfs:label "language" .

dcterms:source a owl:AnnotationProperty ;
  rdfs:label "source" .

dcterms:rights a owl:AnnotationProperty ;
  rdfs:label "rights" .

dcterms:license a owl:ObjectProperty ;
  rdfs:label "license" ;
  rdfs:range dcterms:LicenseDocument .

dcterms:format a owl:AnnotationProperty ;
  rdfs:label "format" .

dcterms:creator a owl:ObjectProperty ;
  rdfs:label "creator" ;
  rdfs:range dcterms:Agent .

dcterms:contributor a owl:ObjectProperty ;
  rdfs:label "contributor" ;
  rdfs:range dcterms:Agent .

dcterms:publisher a owl:ObjectProperty ;
  rdfs:label "publisher" ;
  rdfs:range dcterms:Agent .

dcterms:type a owl:ObjectProperty ;
  rdfs:label "type" .

dcterms:date a owl:DatatypeProperty ;
  rdfs:label "date" ;
  rdfs:range xsd:date .

dcterms:created a owl:DatatypeProperty ;
  rdfs:label "date created" ;
  rdfs:range xsd:date .

dcterms:modified a owl:DatatypeProperty ;
  rdfs:label "date modified" ;
  rdfs:range xsd:date .

dcterms:issued a owl:DatatypeProperty ;
  rdfs:label "date issued" ;
  rdfs:range xsd:date .

dcterms:isPartOf a owl:ObjectProperty ;
  rdfs:label "is part of" .

dcterms:hasPart a owl:ObjectProperty ;
  rdfs:label "has part" .

dcterms:isReferencedBy a owl:ObjectProperty ;
  rdfs:label "is referenced by" .

dcterms:references a owl:ObjectProperty ;
  rdfs:label "references" .

dcterms:replaces a owl:ObjectProperty ;
  rdfs:label "replaces" .

dcterms:isReplacedBy a owl:ObjectProperty ;
  rdfs:label "is replaced by" .
`,
  },
  {
    id: "foaf",
    name: "FOAF",
    description: "Friend of a Friend — people, organizations, relationships, online accounts",
    prefix: "foaf",
    baseUri: "http://xmlns.com/foaf/0.1/",
    turtle: `@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<http://xmlns.com/foaf/0.1/> a owl:Ontology ;
  rdfs:label "FOAF Vocabulary" .

foaf:Agent a owl:Class ;
  rdfs:label "Agent" ;
  rdfs:comment "An agent (person, group, software, etc.)." .

foaf:Person a owl:Class ;
  rdfs:label "Person" ;
  rdfs:subClassOf foaf:Agent ;
  rdfs:comment "A person." .

foaf:Organization a owl:Class ;
  rdfs:label "Organization" ;
  rdfs:subClassOf foaf:Agent .

foaf:Group a owl:Class ;
  rdfs:label "Group" ;
  rdfs:subClassOf foaf:Agent .

foaf:Document a owl:Class ;
  rdfs:label "Document" .

foaf:OnlineAccount a owl:Class ;
  rdfs:label "Online Account" .

foaf:name a owl:DatatypeProperty ;
  rdfs:label "name" ;
  rdfs:domain foaf:Agent ;
  rdfs:range xsd:string .

foaf:firstName a owl:DatatypeProperty ;
  rdfs:label "first name" ;
  rdfs:domain foaf:Person ;
  rdfs:range xsd:string .

foaf:lastName a owl:DatatypeProperty ;
  rdfs:label "last name" ;
  rdfs:domain foaf:Person ;
  rdfs:range xsd:string .

foaf:title a owl:DatatypeProperty ;
  rdfs:label "title" ;
  rdfs:domain foaf:Agent ;
  rdfs:range xsd:string .

foaf:nick a owl:DatatypeProperty ;
  rdfs:label "nickname" ;
  rdfs:domain foaf:Agent ;
  rdfs:range xsd:string .

foaf:mbox a owl:DatatypeProperty ;
  rdfs:label "mailbox" ;
  rdfs:domain foaf:Agent ;
  rdfs:range xsd:anyURI .

foaf:homepage a owl:ObjectProperty ;
  rdfs:label "homepage" ;
  rdfs:domain foaf:Agent ;
  rdfs:range foaf:Document .

foaf:knows a owl:ObjectProperty ;
  rdfs:label "knows" ;
  rdfs:domain foaf:Person ;
  rdfs:range foaf:Person .

foaf:member a owl:ObjectProperty ;
  rdfs:label "member" ;
  rdfs:domain foaf:Group ;
  rdfs:range foaf:Agent .

foaf:img a owl:ObjectProperty ;
  rdfs:label "image" ;
  rdfs:domain foaf:Person ;
  rdfs:range foaf:Document .

foaf:account a owl:ObjectProperty ;
  rdfs:label "account" ;
  rdfs:domain foaf:Agent ;
  rdfs:range foaf:OnlineAccount .

foaf:based_near a owl:ObjectProperty ;
  rdfs:label "based near" ;
  rdfs:domain foaf:Agent .

foaf:age a owl:DatatypeProperty ;
  rdfs:label "age" ;
  rdfs:domain foaf:Person ;
  rdfs:range xsd:nonNegativeInteger .
`,
  },
  {
    id: "schema-org",
    name: "Schema.org (core)",
    description: "schema.org — People, Organizations, Events, Places, Products; widely used for structured data",
    prefix: "schema",
    baseUri: "https://schema.org/",
    turtle: `@prefix schema: <https://schema.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<https://schema.org/> a owl:Ontology ;
  rdfs:label "Schema.org (core)" .

schema:Thing a owl:Class ;
  rdfs:label "Thing" ;
  rdfs:comment "The most generic type of item." .

schema:Person a owl:Class ;
  rdfs:label "Person" ;
  rdfs:subClassOf schema:Thing ;
  rdfs:comment "A person (alive, dead, undead, or fictional)." .

schema:Organization a owl:Class ;
  rdfs:label "Organization" ;
  rdfs:subClassOf schema:Thing ;
  rdfs:comment "An organization such as a school, NGO, corporation, club, etc." .

schema:LocalBusiness a owl:Class ;
  rdfs:label "Local Business" ;
  rdfs:subClassOf schema:Organization .

schema:Event a owl:Class ;
  rdfs:label "Event" ;
  rdfs:subClassOf schema:Thing .

schema:Place a owl:Class ;
  rdfs:label "Place" ;
  rdfs:subClassOf schema:Thing .

schema:Product a owl:Class ;
  rdfs:label "Product" ;
  rdfs:subClassOf schema:Thing .

schema:CreativeWork a owl:Class ;
  rdfs:label "Creative Work" ;
  rdfs:subClassOf schema:Thing .

schema:Article a owl:Class ;
  rdfs:label "Article" ;
  rdfs:subClassOf schema:CreativeWork .

schema:name a owl:DatatypeProperty ;
  rdfs:label "name" ;
  rdfs:domain schema:Thing ;
  rdfs:range xsd:string .

schema:description a owl:DatatypeProperty ;
  rdfs:label "description" ;
  rdfs:domain schema:Thing ;
  rdfs:range xsd:string .

schema:url a owl:DatatypeProperty ;
  rdfs:label "url" ;
  rdfs:domain schema:Thing ;
  rdfs:range xsd:anyURI .

schema:image a owl:DatatypeProperty ;
  rdfs:label "image" ;
  rdfs:domain schema:Thing ;
  rdfs:range xsd:anyURI .

schema:identifier a owl:DatatypeProperty ;
  rdfs:label "identifier" ;
  rdfs:domain schema:Thing ;
  rdfs:range xsd:string .

schema:givenName a owl:DatatypeProperty ;
  rdfs:label "given name" ;
  rdfs:domain schema:Person ;
  rdfs:range xsd:string .

schema:familyName a owl:DatatypeProperty ;
  rdfs:label "family name" ;
  rdfs:domain schema:Person ;
  rdfs:range xsd:string .

schema:email a owl:DatatypeProperty ;
  rdfs:label "email" ;
  rdfs:domain schema:Person ;
  rdfs:range xsd:string .

schema:telephone a owl:DatatypeProperty ;
  rdfs:label "telephone" ;
  rdfs:domain schema:Thing ;
  rdfs:range xsd:string .

schema:birthDate a owl:DatatypeProperty ;
  rdfs:label "birth date" ;
  rdfs:domain schema:Person ;
  rdfs:range xsd:date .

schema:gender a owl:DatatypeProperty ;
  rdfs:label "gender" ;
  rdfs:domain schema:Person ;
  rdfs:range xsd:string .

schema:jobTitle a owl:DatatypeProperty ;
  rdfs:label "job title" ;
  rdfs:domain schema:Person ;
  rdfs:range xsd:string .

schema:knows a owl:ObjectProperty ;
  rdfs:label "knows" ;
  rdfs:domain schema:Person ;
  rdfs:range schema:Person .

schema:memberOf a owl:ObjectProperty ;
  rdfs:label "member of" ;
  rdfs:domain schema:Person ;
  rdfs:range schema:Organization .

schema:employee a owl:ObjectProperty ;
  rdfs:label "employee" ;
  rdfs:domain schema:Organization ;
  rdfs:range schema:Person .

schema:founder a owl:ObjectProperty ;
  rdfs:label "founder" ;
  rdfs:domain schema:Organization ;
  rdfs:range schema:Person .

schema:location a owl:ObjectProperty ;
  rdfs:label "location" ;
  rdfs:domain schema:Event ;
  rdfs:range schema:Place .

schema:organizer a owl:ObjectProperty ;
  rdfs:label "organizer" ;
  rdfs:domain schema:Event ;
  rdfs:range schema:Person .

schema:startDate a owl:DatatypeProperty ;
  rdfs:label "start date" ;
  rdfs:domain schema:Event ;
  rdfs:range xsd:date .

schema:endDate a owl:DatatypeProperty ;
  rdfs:label "end date" ;
  rdfs:domain schema:Event ;
  rdfs:range xsd:date .

schema:address a owl:DatatypeProperty ;
  rdfs:label "address" ;
  rdfs:domain schema:Place ;
  rdfs:range xsd:string .

schema:geo a owl:DatatypeProperty ;
  rdfs:label "geo coordinates" ;
  rdfs:domain schema:Place ;
  rdfs:range xsd:string .

schema:author a owl:ObjectProperty ;
  rdfs:label "author" ;
  rdfs:domain schema:CreativeWork ;
  rdfs:range schema:Person .

schema:datePublished a owl:DatatypeProperty ;
  rdfs:label "date published" ;
  rdfs:domain schema:CreativeWork ;
  rdfs:range xsd:date .

schema:price a owl:DatatypeProperty ;
  rdfs:label "price" ;
  rdfs:domain schema:Product ;
  rdfs:range xsd:decimal .

schema:sku a owl:DatatypeProperty ;
  rdfs:label "SKU" ;
  rdfs:domain schema:Product ;
  rdfs:range xsd:string .
`,
  },
  {
    id: "prov-o",
    name: "PROV-O",
    description: "W3C provenance ontology — entities, activities, agents, derivation, attribution",
    prefix: "prov",
    baseUri: "http://www.w3.org/ns/prov#",
    turtle: `@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<http://www.w3.org/ns/prov-o#> a owl:Ontology ;
  rdfs:label "PROV-O: The PROV Ontology" .

prov:Entity a owl:Class ;
  rdfs:label "Entity" ;
  rdfs:comment "An entity is a physical, digital, conceptual, or other kind of thing with some fixed aspects." .

prov:Activity a owl:Class ;
  rdfs:label "Activity" ;
  rdfs:comment "An activity is something that occurs over a period of time and acts upon or with entities." .

prov:Agent a owl:Class ;
  rdfs:label "Agent" ;
  rdfs:comment "An agent is something that bears some form of responsibility for an activity taking place." .

prov:SoftwareAgent a owl:Class ;
  rdfs:label "Software Agent" ;
  rdfs:subClassOf prov:Agent .

prov:Person a owl:Class ;
  rdfs:label "Person" ;
  rdfs:subClassOf prov:Agent .

prov:Organization a owl:Class ;
  rdfs:label "Organization" ;
  rdfs:subClassOf prov:Agent .

prov:wasGeneratedBy a owl:ObjectProperty ;
  rdfs:label "was generated by" ;
  rdfs:domain prov:Entity ;
  rdfs:range prov:Activity .

prov:wasDerivedFrom a owl:ObjectProperty ;
  rdfs:label "was derived from" ;
  rdfs:domain prov:Entity ;
  rdfs:range prov:Entity .

prov:wasAttributedTo a owl:ObjectProperty ;
  rdfs:label "was attributed to" ;
  rdfs:domain prov:Entity ;
  rdfs:range prov:Agent .

prov:wasAssociatedWith a owl:ObjectProperty ;
  rdfs:label "was associated with" ;
  rdfs:domain prov:Activity ;
  rdfs:range prov:Agent .

prov:used a owl:ObjectProperty ;
  rdfs:label "used" ;
  rdfs:domain prov:Activity ;
  rdfs:range prov:Entity .

prov:actedOnBehalfOf a owl:ObjectProperty ;
  rdfs:label "acted on behalf of" ;
  rdfs:domain prov:Agent ;
  rdfs:range prov:Agent .

prov:startedAtTime a owl:DatatypeProperty ;
  rdfs:label "started at time" ;
  rdfs:domain prov:Activity ;
  rdfs:range xsd:dateTime .

prov:endedAtTime a owl:DatatypeProperty ;
  rdfs:label "ended at time" ;
  rdfs:domain prov:Activity ;
  rdfs:range xsd:dateTime .

prov:generatedAtTime a owl:DatatypeProperty ;
  rdfs:label "generated at time" ;
  rdfs:domain prov:Entity ;
  rdfs:range xsd:dateTime .
`,
  },
];
