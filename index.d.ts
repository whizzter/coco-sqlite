interface CocoSqliteAPI {
	// returns an identical interface that is within an transaction
	begin():Promise<this>;

	// commits an ongoing transaction (if begin returned a separate object it is no longer valid)
	commit():Promise<void>;

	// rollbacks an ongoing transaction (if begin returned a separate object it is no longer valid)
	rollback():Promise<void>;
	

	// executes any query and returns any rows (or an resolves to an error)
	query<T=any>(qs:string,...args:any):Promise<{rowCount:number,rows:[T]}>;

	// simple create object method that should match a select *, inputs type is verified to DB schema and also by checking object
	create<T>(table:string,objs:(T[])|T,check?:(obj:T)=>boolean):Promise<void>;
	
	// simple update object method that should match a select *, input type is verified to DB schema and also by checking object
	update<T>(table:string,objs:(T[])|T,check?:(obj:T)=>boolean):Promise<void>;
	
	// simple delete object method that should match a select *, input type is verified to DB schema and also by checking object
	delete<T>(table:string,objs:(T[])|T,check?:(obj:T)=>boolean):Promise<void>;
}


declare module "coco-sqlite" {
	function init(db:string):CocoSqliteAPI;
	export = init;
}
