// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'game.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;
/// @nodoc
mixin _$MatchStepInfo {

 int get homeRuns; int get awayRuns;
/// Create a copy of MatchStepInfo
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MatchStepInfoCopyWith<MatchStepInfo> get copyWith => _$MatchStepInfoCopyWithImpl<MatchStepInfo>(this as MatchStepInfo, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is MatchStepInfo&&(identical(other.homeRuns, homeRuns) || other.homeRuns == homeRuns)&&(identical(other.awayRuns, awayRuns) || other.awayRuns == awayRuns));
}


@override
int get hashCode => Object.hash(runtimeType,homeRuns,awayRuns);

@override
String toString() {
  return 'MatchStepInfo(homeRuns: $homeRuns, awayRuns: $awayRuns)';
}


}

/// @nodoc
abstract mixin class $MatchStepInfoCopyWith<$Res>  {
  factory $MatchStepInfoCopyWith(MatchStepInfo value, $Res Function(MatchStepInfo) _then) = _$MatchStepInfoCopyWithImpl;
@useResult
$Res call({
 int homeRuns, int awayRuns
});




}
/// @nodoc
class _$MatchStepInfoCopyWithImpl<$Res>
    implements $MatchStepInfoCopyWith<$Res> {
  _$MatchStepInfoCopyWithImpl(this._self, this._then);

  final MatchStepInfo _self;
  final $Res Function(MatchStepInfo) _then;

/// Create a copy of MatchStepInfo
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? homeRuns = null,Object? awayRuns = null,}) {
  return _then(_self.copyWith(
homeRuns: null == homeRuns ? _self.homeRuns : homeRuns // ignore: cast_nullable_to_non_nullable
as int,awayRuns: null == awayRuns ? _self.awayRuns : awayRuns // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

}


/// Adds pattern-matching-related methods to [MatchStepInfo].
extension MatchStepInfoPatterns on MatchStepInfo {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>({TResult Function( MatchStepInfo_AwaitingPitch value)?  awaitingPitch,TResult Function( MatchStepInfo_GameOver value)?  gameOver,required TResult orElse(),}){
final _that = this;
switch (_that) {
case MatchStepInfo_AwaitingPitch() when awaitingPitch != null:
return awaitingPitch(_that);case MatchStepInfo_GameOver() when gameOver != null:
return gameOver(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>({required TResult Function( MatchStepInfo_AwaitingPitch value)  awaitingPitch,required TResult Function( MatchStepInfo_GameOver value)  gameOver,}){
final _that = this;
switch (_that) {
case MatchStepInfo_AwaitingPitch():
return awaitingPitch(_that);case MatchStepInfo_GameOver():
return gameOver(_that);}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>({TResult? Function( MatchStepInfo_AwaitingPitch value)?  awaitingPitch,TResult? Function( MatchStepInfo_GameOver value)?  gameOver,}){
final _that = this;
switch (_that) {
case MatchStepInfo_AwaitingPitch() when awaitingPitch != null:
return awaitingPitch(_that);case MatchStepInfo_GameOver() when gameOver != null:
return gameOver(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>({TResult Function( String batterId,  int balls,  int strikes,  bool highLeverage,  int inning,  bool topOfInning,  int outs,  List<bool> bases,  int homeRuns,  int awayRuns)?  awaitingPitch,TResult Function( int homeRuns,  int awayRuns)?  gameOver,required TResult orElse(),}) {final _that = this;
switch (_that) {
case MatchStepInfo_AwaitingPitch() when awaitingPitch != null:
return awaitingPitch(_that.batterId,_that.balls,_that.strikes,_that.highLeverage,_that.inning,_that.topOfInning,_that.outs,_that.bases,_that.homeRuns,_that.awayRuns);case MatchStepInfo_GameOver() when gameOver != null:
return gameOver(_that.homeRuns,_that.awayRuns);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>({required TResult Function( String batterId,  int balls,  int strikes,  bool highLeverage,  int inning,  bool topOfInning,  int outs,  List<bool> bases,  int homeRuns,  int awayRuns)  awaitingPitch,required TResult Function( int homeRuns,  int awayRuns)  gameOver,}) {final _that = this;
switch (_that) {
case MatchStepInfo_AwaitingPitch():
return awaitingPitch(_that.batterId,_that.balls,_that.strikes,_that.highLeverage,_that.inning,_that.topOfInning,_that.outs,_that.bases,_that.homeRuns,_that.awayRuns);case MatchStepInfo_GameOver():
return gameOver(_that.homeRuns,_that.awayRuns);}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>({TResult? Function( String batterId,  int balls,  int strikes,  bool highLeverage,  int inning,  bool topOfInning,  int outs,  List<bool> bases,  int homeRuns,  int awayRuns)?  awaitingPitch,TResult? Function( int homeRuns,  int awayRuns)?  gameOver,}) {final _that = this;
switch (_that) {
case MatchStepInfo_AwaitingPitch() when awaitingPitch != null:
return awaitingPitch(_that.batterId,_that.balls,_that.strikes,_that.highLeverage,_that.inning,_that.topOfInning,_that.outs,_that.bases,_that.homeRuns,_that.awayRuns);case MatchStepInfo_GameOver() when gameOver != null:
return gameOver(_that.homeRuns,_that.awayRuns);case _:
  return null;

}
}

}

/// @nodoc


class MatchStepInfo_AwaitingPitch extends MatchStepInfo {
  const MatchStepInfo_AwaitingPitch({required this.batterId, required this.balls, required this.strikes, required this.highLeverage, required this.inning, required this.topOfInning, required this.outs, required final  List<bool> bases, required this.homeRuns, required this.awayRuns}): _bases = bases,super._();
  

 final  String batterId;
 final  int balls;
 final  int strikes;
 final  bool highLeverage;
 final  int inning;
 final  bool topOfInning;
 final  int outs;
 final  List<bool> _bases;
 List<bool> get bases {
  if (_bases is EqualUnmodifiableListView) return _bases;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_bases);
}

@override final  int homeRuns;
@override final  int awayRuns;

/// Create a copy of MatchStepInfo
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MatchStepInfo_AwaitingPitchCopyWith<MatchStepInfo_AwaitingPitch> get copyWith => _$MatchStepInfo_AwaitingPitchCopyWithImpl<MatchStepInfo_AwaitingPitch>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is MatchStepInfo_AwaitingPitch&&(identical(other.batterId, batterId) || other.batterId == batterId)&&(identical(other.balls, balls) || other.balls == balls)&&(identical(other.strikes, strikes) || other.strikes == strikes)&&(identical(other.highLeverage, highLeverage) || other.highLeverage == highLeverage)&&(identical(other.inning, inning) || other.inning == inning)&&(identical(other.topOfInning, topOfInning) || other.topOfInning == topOfInning)&&(identical(other.outs, outs) || other.outs == outs)&&const DeepCollectionEquality().equals(other._bases, _bases)&&(identical(other.homeRuns, homeRuns) || other.homeRuns == homeRuns)&&(identical(other.awayRuns, awayRuns) || other.awayRuns == awayRuns));
}


@override
int get hashCode => Object.hash(runtimeType,batterId,balls,strikes,highLeverage,inning,topOfInning,outs,const DeepCollectionEquality().hash(_bases),homeRuns,awayRuns);

@override
String toString() {
  return 'MatchStepInfo.awaitingPitch(batterId: $batterId, balls: $balls, strikes: $strikes, highLeverage: $highLeverage, inning: $inning, topOfInning: $topOfInning, outs: $outs, bases: $bases, homeRuns: $homeRuns, awayRuns: $awayRuns)';
}


}

/// @nodoc
abstract mixin class $MatchStepInfo_AwaitingPitchCopyWith<$Res> implements $MatchStepInfoCopyWith<$Res> {
  factory $MatchStepInfo_AwaitingPitchCopyWith(MatchStepInfo_AwaitingPitch value, $Res Function(MatchStepInfo_AwaitingPitch) _then) = _$MatchStepInfo_AwaitingPitchCopyWithImpl;
@override @useResult
$Res call({
 String batterId, int balls, int strikes, bool highLeverage, int inning, bool topOfInning, int outs, List<bool> bases, int homeRuns, int awayRuns
});




}
/// @nodoc
class _$MatchStepInfo_AwaitingPitchCopyWithImpl<$Res>
    implements $MatchStepInfo_AwaitingPitchCopyWith<$Res> {
  _$MatchStepInfo_AwaitingPitchCopyWithImpl(this._self, this._then);

  final MatchStepInfo_AwaitingPitch _self;
  final $Res Function(MatchStepInfo_AwaitingPitch) _then;

/// Create a copy of MatchStepInfo
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? batterId = null,Object? balls = null,Object? strikes = null,Object? highLeverage = null,Object? inning = null,Object? topOfInning = null,Object? outs = null,Object? bases = null,Object? homeRuns = null,Object? awayRuns = null,}) {
  return _then(MatchStepInfo_AwaitingPitch(
batterId: null == batterId ? _self.batterId : batterId // ignore: cast_nullable_to_non_nullable
as String,balls: null == balls ? _self.balls : balls // ignore: cast_nullable_to_non_nullable
as int,strikes: null == strikes ? _self.strikes : strikes // ignore: cast_nullable_to_non_nullable
as int,highLeverage: null == highLeverage ? _self.highLeverage : highLeverage // ignore: cast_nullable_to_non_nullable
as bool,inning: null == inning ? _self.inning : inning // ignore: cast_nullable_to_non_nullable
as int,topOfInning: null == topOfInning ? _self.topOfInning : topOfInning // ignore: cast_nullable_to_non_nullable
as bool,outs: null == outs ? _self.outs : outs // ignore: cast_nullable_to_non_nullable
as int,bases: null == bases ? _self._bases : bases // ignore: cast_nullable_to_non_nullable
as List<bool>,homeRuns: null == homeRuns ? _self.homeRuns : homeRuns // ignore: cast_nullable_to_non_nullable
as int,awayRuns: null == awayRuns ? _self.awayRuns : awayRuns // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}

/// @nodoc


class MatchStepInfo_GameOver extends MatchStepInfo {
  const MatchStepInfo_GameOver({required this.homeRuns, required this.awayRuns}): super._();
  

@override final  int homeRuns;
@override final  int awayRuns;

/// Create a copy of MatchStepInfo
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MatchStepInfo_GameOverCopyWith<MatchStepInfo_GameOver> get copyWith => _$MatchStepInfo_GameOverCopyWithImpl<MatchStepInfo_GameOver>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is MatchStepInfo_GameOver&&(identical(other.homeRuns, homeRuns) || other.homeRuns == homeRuns)&&(identical(other.awayRuns, awayRuns) || other.awayRuns == awayRuns));
}


@override
int get hashCode => Object.hash(runtimeType,homeRuns,awayRuns);

@override
String toString() {
  return 'MatchStepInfo.gameOver(homeRuns: $homeRuns, awayRuns: $awayRuns)';
}


}

/// @nodoc
abstract mixin class $MatchStepInfo_GameOverCopyWith<$Res> implements $MatchStepInfoCopyWith<$Res> {
  factory $MatchStepInfo_GameOverCopyWith(MatchStepInfo_GameOver value, $Res Function(MatchStepInfo_GameOver) _then) = _$MatchStepInfo_GameOverCopyWithImpl;
@override @useResult
$Res call({
 int homeRuns, int awayRuns
});




}
/// @nodoc
class _$MatchStepInfo_GameOverCopyWithImpl<$Res>
    implements $MatchStepInfo_GameOverCopyWith<$Res> {
  _$MatchStepInfo_GameOverCopyWithImpl(this._self, this._then);

  final MatchStepInfo_GameOver _self;
  final $Res Function(MatchStepInfo_GameOver) _then;

/// Create a copy of MatchStepInfo
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? homeRuns = null,Object? awayRuns = null,}) {
  return _then(MatchStepInfo_GameOver(
homeRuns: null == homeRuns ? _self.homeRuns : homeRuns // ignore: cast_nullable_to_non_nullable
as int,awayRuns: null == awayRuns ? _self.awayRuns : awayRuns // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}

// dart format on
