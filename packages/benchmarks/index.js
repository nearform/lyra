import cronometro from "cronometro";
import prefixSearch from "./engines/prefix-search.js";
import exactSearch from "./engines/exact-search.js";
import indexing from "./engines/indexing.js";
import typoTolerance from "./engines/typo-tolerance.js";
import prefixSearchMovies from "./engines/prefix-search-movies.js";
import queryClauses from "./engines/query-clauses.js";

cronometro(indexing);
cronometro(prefixSearch);
cronometro(exactSearch);
cronometro(typoTolerance);
cronometro(prefixSearchMovies);
cronometro(queryClauses);
